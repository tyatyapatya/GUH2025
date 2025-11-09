// Lobby Starfield Background (matches main menu)
(function() {
  const bg = document.getElementById('lobbyStarfieldBg');
  if (!bg) return;

  const STAR_COUNT = 200;

  function createBackgroundStars() {
    for (let i = 0; i < STAR_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'starfield-star';
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const size = (Math.random() * 2 + 0.5).toFixed(2);
      const delay = (Math.random() * 5).toFixed(2);
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.animationDelay = delay + 's';
      bg.appendChild(el);
    }
  }

  function createShootingStars() {
    const COUNT = 3;
    for (let i = 0; i < COUNT; i++) {
      const s = document.createElement('div');
      s.className = 'shooting-star';
      s.style.animation = 'none'; // We'll drive via WAAPI for randomness per cycle
      bg.appendChild(s);

      const launchStar = (el) => {
        const left = Math.random() * 100; // %
        const top = Math.random() * 50;   // upper half
        const size = 1 + Math.random() * 3; // 1-4 px
        el.style.left = left + '%';
        el.style.top = top + '%';
        el.style.width = size + 'px';
        el.style.height = size + 'px';

        const distance = 200 + Math.random() * 400; // px
        const angleDeg = 20 + Math.random() * 50;   // degrees
        const angle = (angleDeg * Math.PI) / 180;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const duration = 1200 + Math.random() * 2000; // ms
        const delay = Math.random() * 8000; // ms

        setTimeout(() => {
          const anim = el.animate([
            { transform: 'translate(0, 0)', opacity: 0 },
            { offset: 0.1, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }
          ], {
            duration,
            easing: 'ease-out',
            fill: 'forwards'
          });
          anim.onfinish = () => launchStar(el);
        }, delay);
      };

      launchStar(s);
    }
  }

  createBackgroundStars();
  createShootingStars();

  // Fade-in the overlay so stars appear gradually
  window.requestAnimationFrame(() => {
    const overlay = bg.closest('.starfield-overlay');
    if (overlay) {
      setTimeout(() => overlay.classList.add('revealed'), 50);
    }
  });
})();
