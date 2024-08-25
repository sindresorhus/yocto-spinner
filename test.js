import process from 'node:process';
import {PassThrough} from 'node:stream';
import getStream from 'get-stream';
import test from 'ava';
import stripAnsi from 'strip-ansi';
import yoctoSpinner from './index.js';

delete process.env.CI;

const getPassThroughStream = () => {
	const stream = new PassThrough();
	stream.clearLine = () => {};
	stream.cursorTo = () => {};
	stream.moveCursor = () => {};
	return stream;
};

const runSpinner = async (function_, options = {}) => {
	const stream = getPassThroughStream();
	const output = getStream(stream);

	const spinner = yoctoSpinner({
		stream,
		text: 'foo',
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
	t.regex(output, /✖️ foo\n$/);
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

test('spinner starts with custom text', async t => {
	const output = await runSpinner(spinner => spinner.stop(), {text: 'custom'});
	t.is(output, '- custom\n');
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
	t.regex(output, /✖️ failed\n$/);
});
