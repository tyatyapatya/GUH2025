// Main Menu Starfield (standalone)
(function() {
  // Fade-in the overlay so stars appear gradually
  window.requestAnimationFrame(() => {
    const overlay = document.querySelector('.starfield-overlay');
    if (overlay) {
      setTimeout(() => overlay.classList.add('revealed'), 50);
    }
  });
  const starfieldBg = document.getElementById('starfieldBg');
  const menuStarsStage = document.getElementById('menuStarsStage');
  const STAR_COUNT = 200;
  const backgroundStars = [];

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
      starfieldBg.appendChild(el);
      backgroundStars.push(el);
    }
  }

  const menuStars = [
    { id: 'new-meeting', x: 50, y: 35, color: '#60a5fa', glowColor: '#3b82f6', label: 'Find Meeting Point', description: 'Add locations and find the perfect middle ground', icon: '📍' },
    { id: 'login', x: 35, y: 35, color: '#a78bfa', glowColor: '#8b5cf6', label: 'Login', description: 'Sign in with Google', icon: '👤' },
    // { id: 'group-meeting', x: 70, y: 55, color: '#34d399', glowColor: '#10b981', label: 'Group Meeting', description: 'Coordinate with multiple people', icon: '👥' },
    // { id: 'settings', x: 40, y: 70, color: '#fbbf24', glowColor: '#f59e0b', label: 'Settings', description: 'Customize your preferences', icon: '⚙️' },
    { id: 'about', x: 65, y: 35, color: '#f472b6', glowColor: '#ec4899', label: 'About', description: 'Learn more about this tool', icon: 'ℹ️' },
  ];

  function createMenuStars() {
    menuStars.forEach(ms => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-star';
      btn.style.left = ms.x + '%';
      btn.style.top = ms.y + '%';
      btn.style.color = ms.color;

      const glow = document.createElement('div');
      glow.className = 'outer-glow';
      glow.style.background = ms.glowColor;
      btn.appendChild(glow);

      const core = document.createElement('div');
      core.className = 'core';
      core.style.background = ms.color;
      core.style.boxShadow = `0 0 20px ${ms.color}`;
      core.textContent = ms.icon;
      btn.appendChild(core);

      const ring = document.createElement('div');
      ring.className = 'ring';
      btn.appendChild(ring);

      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.innerHTML = `<div style="margin-bottom:4px; font-weight:600;">${ms.label}</div><div style="font-size:12px; color:#9ca3af;">${ms.description}</div>`;
      btn.appendChild(tooltip);

      btn.addEventListener('mouseenter', () => {
        btn.classList.add('hovered');
        glow.style.opacity = '0.6';
        glow.style.transform = 'translate(-50%, -50%) scale(1.5)';
        core.style.boxShadow = `0 0 40px ${ms.color}, 0 0 60px ${ms.glowColor}`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.classList.remove('hovered');
        glow.style.opacity = '0.2';
        glow.style.transform = 'translate(-50%, -50%) scale(1)';
        core.style.boxShadow = `0 0 20px ${ms.color}`;
      });

      btn.addEventListener('click', () => {
        if (ms.id === 'new-meeting') {
          window.location.href = '/lobby';
        } else if (ms.id === 'about') {
          window.location.href = '/about';
        } else if (ms.id === 'login') {
          if (typeof window.startLogin === 'function') {
            window.startLogin();
          } else {
            console.warn('Login function not available yet.');
          }
        } else {
          console.log(`Menu star clicked: ${ms.id}`);
        }
      });

      // Keyboard accessibility: Enter/Space activate
      btn.setAttribute('aria-label', ms.label);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });

      menuStarsStage.appendChild(btn);
    });
  }

  function createShootingStars() {
    const COUNT = 3;
    for (let i = 0; i < COUNT; i++) {
      const s = document.createElement('div');
      s.className = 'shooting-star';
      s.style.animation = 'none'; // disable uniform CSS animation
      starfieldBg.appendChild(s);

      const launchStar = (el) => {
        // Random starting position (upper half), size 1-4px
        const left = Math.random() * 100;
        const top = Math.random() * 50;
        const size = 1 + Math.random() * 3; // px
        el.style.left = left + '%';
        el.style.top = top + '%';
        el.style.width = size + 'px';
        el.style.height = size + 'px';

        // Random trajectory
        const distance = 200 + Math.random() * 400; // 200-600px
        const angleDeg = 20 + Math.random() * 50;   // 20-70°
        const angle = angleDeg * Math.PI / 180;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;

        // Random timing
        const duration = 1200 + Math.random() * 2000; // 1.2s - 3.2s
        const delay = Math.random() * 8000; // up to 8s pause before each run

        setTimeout(() => {
          const anim = el.animate([
            { transform: 'translate(0,0)', opacity: 0 },
            { offset: 0.10, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }
          ], {
            duration,
            easing: 'ease-out',
            fill: 'forwards'
          });
          anim.onfinish = () => launchStar(el); // recurse with new randoms
        }, delay);
      };

      launchStar(s);
    }
  }

  // Init
  createBackgroundStars();
  createMenuStars();
  createShootingStars();
})();
