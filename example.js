import yoctoSpinner from './index.js';

const spinner = yoctoSpinner({
	text: 'Loading unicorns\n  (And rainbows)',
}).start();

setTimeout(() => {
	spinner.text = 'Calculating splines';
}, 2000);

setTimeout(() => {
	spinner.success('Finished!');
}, 5000);
