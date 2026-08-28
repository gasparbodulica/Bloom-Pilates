import './style.css'
import { currentLang, setLang, t } from './i18n.js'
import logoUrl from './assets/logo.jpg'

document.querySelectorAll('.logo-img').forEach(el => { el.src = logoUrl; })

// Refresh should land at the top, not wherever the browser last remembered.
// Left on 'auto' the page restores mid-document, which also means every
// reveal above that point has already been passed.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const jumpToTop = () => {
  if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
};
jumpToTop();
window.addEventListener('load', jumpToTop);

// ==========================================
// 1. DOM Elements & State
// ==========================================

// Navbar & Menu
const navbar = document.getElementById('main-navbar');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const navLinksMenu = document.getElementById('nav-links-menu');
const navLinks = document.querySelectorAll('.nav-link-item');

// Waiting List Form
const waitlistForm = document.getElementById('newsletter-subscription-form');
const waitlistEmail = document.getElementById('newsletter-email');
const waitlistSubmitBtn = document.getElementById('newsletter-submit-btn');

// ==========================================
// 2. Scroll Effect & Mobile Navigation Menu
// ==========================================
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Update active navigation link on scroll
  const scrollPosition = window.scrollY + 120;
  const sections = document.querySelectorAll('section');

  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');

    if (scrollPosition >= top && scrollPosition < top + height) {
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${id}`) {
          link.classList.add('active');
        }
      });
    }
  });
});

// Toggle Mobile Menu
mobileMenuToggle.addEventListener('click', () => {
  mobileMenuToggle.classList.toggle('active');
  navLinksMenu.classList.toggle('active');
});

// Close Mobile Menu on Nav Link Click
navLinks.forEach(link => {
  link.addEventListener('click', () => {
    mobileMenuToggle.classList.remove('active');
    navLinksMenu.classList.remove('active');
  });
});

// ==========================================
// 3. Waiting List Form
// ==========================================
waitlistForm.addEventListener('submit', (e) => {
  e.preventDefault();

  waitlistSubmitBtn.disabled = true;
  waitlistSubmitBtn.textContent = t('newsletter.sending');

  // Simulate send — replace with real Formspree submit when ready
  setTimeout(() => {
    waitlistSubmitBtn.textContent = t('newsletter.sent');
    waitlistForm.reset();
    waitlistEmail.disabled = true;

    waitlistSubmitBtn.style.backgroundColor = 'var(--secondary-dark)';
    waitlistSubmitBtn.style.borderColor = 'var(--secondary-dark)';
  }, 1000);
});

// ==========================================
// 5. Scroll Reveal Animations
// ==========================================
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hero copy gets a staggered entrance on load rather than on scroll
document.querySelectorAll('.hero-content-centered > *').forEach(el => {
  el.classList.add('hero-enter');
});

const revealSelectors = [
  '.section-header',
  '.prelaunch-top',
  '.prelaunch-grid-item',
  '.prelaunch-cta',
  '.method-list-item',
  '.contact-header',
  '.contact-grid > *',
  '.split-content',
  '.footer-grid > *'
];

revealSelectors.forEach(selector => {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.add('reveal');
    const siblings = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
    const index = siblings.indexOf(el);
    if (index > 0) el.style.transitionDelay = `${index * 0.1}s`;
  });
});

// photo panels settle out of a slow push-in
document.querySelectorAll('.split-photo').forEach(el => el.classList.add('reveal-photo'));

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal, .reveal-photo').forEach(el => revealObserver.observe(el));
} else {
  document.querySelectorAll('.reveal, .reveal-photo').forEach(el => el.classList.add('is-visible'));
}

// ==========================================
// 5b. Photo parallax — drifts the panel images as they pass
// ==========================================
if (!reduceMotion) {
  const parallaxPhotos = Array.from(document.querySelectorAll('.split-photo img'));
  if (parallaxPhotos.length) {
    let ticking = false;
    const updateParallax = () => {
      const vh = window.innerHeight;
      parallaxPhotos.forEach(img => {
        const rect = img.parentElement.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        // -1 (below the fold) .. 1 (above it)
        const progress = (vh / 2 - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2);
        img.style.setProperty('--py', `${(progress * 18).toFixed(2)}px`);
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    }, { passive: true });
    window.addEventListener('resize', updateParallax, { passive: true });
    updateParallax();
  }
}

// ==========================================
// 6. Language Switcher
// ==========================================
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    setLang(lang);
  });
});

if (currentLang !== 'hr') {
  setLang(currentLang);
}
