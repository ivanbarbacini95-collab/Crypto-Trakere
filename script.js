const splash = document.getElementById('splash');
const tracker = document.getElementById('tracker');
const progressBar = document.getElementById('progress-bar');

let progress = 0;

const interval = setInterval(() => {
    progress += 1;
    progressBar.style.width = progress + '%';

    if (progress >= 100) {
        clearInterval(interval);
        splash.style.display = 'none';
        tracker.style.display = 'block';
    }
}, 30);
