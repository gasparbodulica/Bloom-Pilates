import './style.css'
import { currentLang, setLang, t } from './i18n.js'
import logoUrl from './assets/logo.jpg'

document.querySelectorAll('.logo-img').forEach(el => { el.src = logoUrl; })

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
const revealSelectors = [
  '.section-header',
  '.prelaunch-grid-item',
  '.method-list-item',
  '.contact-grid > *',
  '.split-content'
];

revealSelectors.forEach(selector => {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.add('reveal');
    const parent = el.parentElement;
    const revealedSiblings = Array.from(parent.children).filter(c => c.classList.contains('reveal'));
    const index = revealedSiblings.indexOf(el);
    if (index > 0) {
      el.style.transitionDelay = `${index * 0.1}s`;
    }
  });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

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
