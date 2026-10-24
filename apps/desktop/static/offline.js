// The offline page (m5-plan.md decision 2). The shell loads it with the client's URL and how many tries have failed.
// It goes back to the client when the network returns, on Retry, and on a timer: 15 s, then 30 s, then every 60 s.
// A failed try lands here again with the count one higher.
const params = new URLSearchParams(location.search);
const url = params.get('url');
const attempt = Number(params.get('attempt')) || 1;
const wait = Math.min(15 * 2 ** (attempt - 1), 60);
const status = document.getElementById('status');

const retry = () => { if (url) location.replace(url); };
let left = wait;
const tick = () => {
  if (left <= 0) return retry();
  status.textContent = `Check your connection. Trying again in ${left} s.`;
  left -= 1;
  setTimeout(tick, 1000);
};
tick();
addEventListener('online', retry);
document.getElementById('retry').addEventListener('click', retry);
