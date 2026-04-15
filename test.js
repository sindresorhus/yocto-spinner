import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import {PassThrough} from 'node:stream';
import getStream from 'get-stream';
import test from 'ava';
import stripAnsi from 'strip-ansi';
import yoctocolors from 'yoctocolors';
import yoctoSpinner from './index.js';

delete process.env.CI;

const synchronizedOutputEnable = '\u001B[?2026h';
const synchronizedOutputDisable = '\u001B[?2026l';

const getPassThroughStream = () => {
	const stream = new PassThrough();
	stream.clearLine = () => {};
	stream.cursorTo = () => {};
	stream.moveCursor = () => {};
	return stream;
};

const runSpinner = async (function_, options = {}, testOptions = {}) => {
	const stream = testOptions.stream ?? getPassThroughStream();
	// Set isTTY to false by default for tests to get predictable newline behavior
	if (stream.isTTY === undefined) {
		stream.isTTY = false;
	}

	const output = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: testOptions.text ?? 'foo',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
		...options,
	});

	spinner.start();
	function_(spinner);
	stream.end();

	return stripAnsi(await output);
};

test('start and stop spinner', async t => {
	const output = await runSpinner(spinner => spinner.stop());
	t.is(output, '- foo\n');
});

test('spinner.success()', async t => {
	const output = await runSpinner(spinner => spinner.success());
	t.regex(output, /✔ foo\n$/);
});

test('spinner.error()', async t => {
	const output = await runSpinner(spinner => spinner.error());
	t.regex(output, /✖ foo\n$/);
});

test('spinner.warning()', async t => {
	const output = await runSpinner(spinner => spinner.warning());
	t.regex(output, /⚠ foo\n$/);
});

test('spinner.info()', async t => {
	const output = await runSpinner(spinner => spinner.info());
	t.regex(output, /ℹ foo\n$/);
});

test('spinner changes text', async t => {
	const output = await runSpinner(spinner => {
		spinner.text = 'bar';
		spinner.stop();
	});
	t.is(output, '- foo\n- bar\n');
});

test('spinner stops with final text', async t => {
	const output = await runSpinner(spinner => spinner.stop('final'));
	t.regex(output, /final\n$/);
});

test('spinner with non-TTY stream', t => {
	const stream = getPassThroughStream();
	stream.isTTY = false;
	const spinner = yoctoSpinner({stream, text: 'foo'});

	spinner.start();
	spinner.stop('final');
	t.pass();
});

test('spinner does not hook non-interactive streams', t => {
	const stream = getPassThroughStream();
	stream.isTTY = false;

	const spinner = yoctoSpinner({stream, text: 'foo'});
	const originalWrite = stream.write;

	spinner.start();
	t.is(stream.write, originalWrite);
	spinner.stop();
	t.is(stream.write, originalWrite);
});

test('spinner subscribes to process signals by default', t => {
	const initialSigintCount = process.rawListeners('SIGINT').length;
	const initialSigtermCount = process.rawListeners('SIGTERM').length;

	const stream = getPassThroughStream();
	const spinner = yoctoSpinner({stream, text: 'foo'});

	spinner.start();

	t.is(process.rawListeners('SIGINT').length, initialSigintCount + 1);
	t.is(process.rawListeners('SIGTERM').length, initialSigtermCount + 1);

	spinner.stop();

	t.is(process.rawListeners('SIGINT').length, initialSigintCount);
	t.is(process.rawListeners('SIGTERM').length, initialSigtermCount);
});

test('spinner can disable process signal handling', t => {
	const initialSigintCount = process.rawListeners('SIGINT').length;
	const initialSigtermCount = process.rawListeners('SIGTERM').length;

	const stream = getPassThroughStream();
	const spinner = yoctoSpinner({
		stream,
		text: 'foo',
		handleSignals: false,
	});

	spinner.start();

	t.is(process.rawListeners('SIGINT').length, initialSigintCount);
	t.is(process.rawListeners('SIGTERM').length, initialSigtermCount);

	spinner.stop();

	t.is(process.rawListeners('SIGINT').length, initialSigintCount);
	t.is(process.rawListeners('SIGTERM').length, initialSigtermCount);
});

test('spinner starts with custom text', async t => {
	const output = await runSpinner(spinner => spinner.stop(), {text: 'custom'});
	t.is(output, '- custom\n');
});

test('spinner uses synchronized output in interactive mode', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const output = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'foo',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();
	spinner.stop();
	stream.end();

	const result = await output;
	t.true(result.includes(synchronizedOutputEnable));
	t.true(result.includes(synchronizedOutputDisable));
	t.true(result.indexOf(synchronizedOutputEnable) < result.indexOf(synchronizedOutputDisable));
});

test('spinner starts and changes text multiple times', async t => {
	const output = await runSpinner(spinner => {
		spinner.text = 'bar';
		spinner.text = 'baz';
		spinner.stop();
	});
	t.is(output, '- foo\n- bar\n- baz\n');
});

test('spinner handles multiple start/stop cycles', async t => {
	const output = await runSpinner(spinner => {
		spinner.stop();
		spinner.start('bar');
		spinner.stop();
		spinner.start('baz');
		spinner.stop();
	});
	t.is(output, '- foo\n- bar\n- baz\n');
});

test('spinner stops with success symbol and final text', async t => {
	const output = await runSpinner(spinner => spinner.success('done'));
	t.regex(output, /✔ done\n$/);
});

test('spinner stops with error symbol and final text', async t => {
	const output = await runSpinner(spinner => spinner.error('failed'));
	t.regex(output, /✖ failed\n$/);
});

test('spinner accounts for ANSI escape codes when computing line breaks', async t => {
	const scenarios = [
		// 1 symbol + 1 space + 78 chars = 80 chars, max for one line
		{
			textLength: 78,
			clearLineCount: 1,
		},

		// 1 symbol + 1 space + 79 chars = 81 chars, split on two lines
		{
			textLength: 79,
			clearLineCount: 2,
		},
	];

	for (const scenario of scenarios) {
		let clearLineCount = 0;

		const stream = new PassThrough();
		stream.clearLine = () => {
			clearLineCount += 1;
		};

		stream.cursorTo = () => {};
		stream.moveCursor = () => {};
		stream.isTTY = true;

		let text = '';
		for (let i = 0; i < scenario.textLength; i++) {
			text += yoctocolors.blue('a');
		}

		// eslint-disable-next-line no-await-in-loop
		await runSpinner(spinner => spinner.stop(), {}, {
			stream,
			text,
		});
		t.is(clearLineCount, scenario.clearLineCount);
	}
});

test('spinner in non-interactive mode only renders on text changes', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = false;

	const output = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'initial text',
		spinner: {
			frames: ['-'],
			interval: 10,
		},
	});

	spinner.start();

	// Wait to ensure no additional renders happen
	await delay(50);

	spinner.text = 'changed text';

	await delay(50);

	spinner.stop('final text');
	stream.end();

	const result = stripAnsi(await output);
	const lines = result.trim().split('\n');

	// Should only have 3 lines: initial, changed, and final
	t.is(lines.length, 3);
	t.is(lines[0], '- initial text');
	t.is(lines[1], '- changed text');
	t.is(lines[2], 'final text');
});

test('spinner keeps output below external writes while spinning', t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const cursorToCalls = [];
	const writeEvents = [];

	const originalWrite = stream.write;
	stream.write = function (content, encoding, callback) {
		writeEvents.push(stripAnsi(String(content)));
		return originalWrite.call(this, content, encoding, callback);
	};

	stream.cursorTo = () => {
		cursorToCalls.push('cursorTo');
	};

	const spinner = yoctoSpinner({
		stream,
		text: 'spinning',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();

	const cursorToCountAfterStart = cursorToCalls.length;

	stream.write('External log\n');

	spinner.stop('done');
	stream.end();

	t.true(cursorToCalls.length > cursorToCountAfterStart, 'external write should clear the spinner before output');

	const externalWriteIndex = writeEvents.findIndex(event => event.includes('External log'));
	t.true(externalWriteIndex !== -1);

	const reRenderIndex = writeEvents.findIndex((event, index) => index > externalWriteIndex && event.includes('spinning'));
	t.true(reRenderIndex !== -1, 'spinner should re-render after external write');
});

test('external writes preserve chunk boundaries without injected newlines', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;
	const outputPromise = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'processing',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();

	stream.write('Downloading ');
	stream.write('42%');
	stream.write('\n');

	spinner.stop();
	stream.end();

	const output = stripAnsi(await outputPromise).replaceAll('\r', '');
	t.true(output.includes('Downloading 42%\n'));
	t.false(output.includes('Downloading \n42%'));
});

test('spinner defers renders until a newline completes the external line', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const writeEvents = [];

	const originalWrite = stream.write;
	stream.write = function (content, encoding, callback) {
		writeEvents.push(stripAnsi(String(content)));
		return originalWrite.call(this, content, encoding, callback);
	};

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 20,
		},
	});

	spinner.start();
	const baselineWrites = writeEvents.length;

	stream.write('Partial without newline');
	await delay(80);

	t.is(writeEvents.length, baselineWrites + 1, 'spinner should not render while line is incomplete');

	stream.write('\n');
	await delay(40);

	t.true(writeEvents.length > baselineWrites + 1, 'spinner should render after newline');

	spinner.stop();
	stream.end();
});

test('spinner defers renders on carriage return updates', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const writeEvents = [];

	const originalWrite = stream.write;
	stream.write = function (content, encoding, callback) {
		writeEvents.push(stripAnsi(String(content)));
		return originalWrite.call(this, content, encoding, callback);
	};

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 20,
		},
	});

	spinner.start();
	const baselineWrites = writeEvents.length;

	stream.write('\rProgress 1');
	await delay(80);

	t.is(writeEvents.length, baselineWrites + 1, 'spinner should not render while carriage return updates are in progress');

	stream.write('\n');
	await delay(40);

	t.true(writeEvents.length > baselineWrites + 1, 'spinner should render after newline');

	spinner.stop();
	stream.end();
});

test('spinner resumes after carriage return newline', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const writeEvents = [];

	const originalWrite = stream.write;
	stream.write = function (content, encoding, callback) {
		writeEvents.push(stripAnsi(String(content)));
		return originalWrite.call(this, content, encoding, callback);
	};

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 20,
		},
	});

	spinner.start();
	const baselineWrites = writeEvents.length;

	stream.write('\rProgress 1\r\n');
	await delay(80);

	t.true(writeEvents.length > baselineWrites + 1, 'spinner should render after carriage return newline');

	spinner.stop();
	stream.end();
});

test('spinner defers when chunk ends with an incomplete line', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const writeEvents = [];

	const originalWrite = stream.write;
	stream.write = function (content, encoding, callback) {
		writeEvents.push(stripAnsi(String(content)));
		return originalWrite.call(this, content, encoding, callback);
	};

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 20,
		},
	});

	spinner.start();
	const baselineWrites = writeEvents.length;

	stream.write('Step 1\nProgress 50%');
	await delay(80);

	t.is(writeEvents.length, baselineWrites + 1, 'spinner should not render while last line is incomplete');

	stream.write('\n');
	await delay(40);

	t.true(writeEvents.length > baselineWrites + 1, 'spinner should render after newline');

	spinner.stop();
	stream.end();
});

test('spinner stop preserves partial external lines', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;
	const outputPromise = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();

	stream.write('Downloading ');

	spinner.stop('done');
	stream.end();

	const output = stripAnsi(await outputPromise).replaceAll('\r', '');

	t.true(output.includes('Downloading \n'));
	t.regex(output, /Downloading \n[\s\S]*done\n/);
	t.false(output.includes('Downloading done'));
});

test('spinner stop without final text preserves partial external lines', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;
	const outputPromise = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();

	stream.write('Downloading ');

	spinner.stop();
	stream.end();

	const output = stripAnsi(await outputPromise).replaceAll('\r', '');

	t.true(output.includes('Downloading '));
	t.false(output.includes('Downloading \n'));
});

test('spinner does not defer when stdout is non-interactive', async t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const stdoutStream = getPassThroughStream();
	stdoutStream.isTTY = false;

	const outputPromise = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'waiting',
		spinner: {
			frames: ['-'],
			interval: 20,
		},
	});

	const originalStdoutWrite = process.stdout.write;
	process.stdout.write = stdoutStream.write.bind(stdoutStream);

	try {
		spinner.start();
		stdoutStream.write('chunk without newline');
		await delay(80);

		spinner.stop('done');
		stream.end();

		const output = stripAnsi(await outputPromise);
		t.true(output.includes('done\n'));
	} finally {
		process.stdout.write = originalStdoutWrite;
	}
});

test('spinner preserves external stream.write wrappers on stop', t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const spinner = yoctoSpinner({
		stream,
		text: 'wrapper',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();

	const originalWrite = stream.write;
	const wrappedWrite = function (content, encoding, callback) {
		return originalWrite.call(this, content, encoding, callback);
	};

	stream.write = wrappedWrite;
	spinner.stop();

	t.is(stream.write, wrappedWrite);
	stream.end();
});

test('spinner.interval rejects negative values', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: ['-'], interval: -100}});
	}, {message: /positive integer/});
});

test('spinner.interval rejects non-integer values', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: ['-'], interval: 1.5}});
	}, {message: /positive integer/});
});

test('spinner.interval rejects zero', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: ['-'], interval: 0}});
	}, {message: /positive integer/});
});

test('spinner.frames rejects empty array', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: []}});
	}, {message: /non-empty array of strings/});
});

test('spinner.frames rejects non-array', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: 'not-an-array'}});
	}, {message: /non-empty array of strings/});
});

test('spinner.frames rejects non-string elements', t => {
	t.throws(() => {
		yoctoSpinner({spinner: {frames: [123, 456]}});
	}, {message: /non-empty array of strings/});
});

test('spinner.interval defaults to 80 when not provided', t => {
	const stream = getPassThroughStream();
	stream.isTTY = false;

	const spinner = yoctoSpinner({
		stream,
		spinner: {frames: ['a', 'b']},
	});

	spinner.start();
	spinner.stop();
	t.pass();
});

test('spinner preserves pre-existing stream.write wrappers', t => {
	const stream = getPassThroughStream();
	stream.isTTY = true;

	const originalWrite = stream.write;
	const wrappedWrite = function (content, encoding, callback) {
		return originalWrite.call(this, content, encoding, callback);
	};

	stream.write = wrappedWrite;

	const spinner = yoctoSpinner({
		stream,
		text: 'wrapper',
		spinner: {
			frames: ['-'],
			interval: 10_000,
		},
	});

	spinner.start();
	spinner.stop();

	t.is(stream.write, wrappedWrite);
	stream.end();
});
