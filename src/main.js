import './style.css'

// ==========================================
// 1. Weekly Schedule Data
// ==========================================
const scheduleData = {
  Mon: [
    { id: 'm1', time: '07:00 AM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 3 },
    { id: 'm2', time: '09:30 AM', name: 'Tower Sculpt', instructor: 'Marcus Sterling', spots: 8 },
    { id: 'm3', time: '12:00 PM', name: 'Mat Core Express', instructor: 'Sarah Jenkins', spots: 12 },
    { id: 'm4', time: '05:30 PM', name: 'Reformer Power Flow', instructor: 'Jessica Chang', spots: 0 }
  ],
  Tue: [
    { id: 't1', time: '08:00 AM', name: 'Reformer Align', instructor: 'Jessica Chang', spots: 5 },
    { id: 't2', time: '10:30 AM', name: 'Tower Pilates', instructor: 'Marcus Sterling', spots: 2 },
    { id: 't3', time: '06:00 PM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 7 }
  ],
  Wed: [
    { id: 'w1', time: '07:00 AM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 4 },
    { id: 'w2', time: '09:30 AM', name: 'Tower Sculpt', instructor: 'Marcus Sterling', spots: 7 },
    { id: 'w3', time: '05:30 PM', name: 'Reformer Power Flow', instructor: 'Jessica Chang', spots: 1 }
  ],
  Thu: [
    { id: 'th1', time: '08:00 AM', name: 'Reformer Align', instructor: 'Jessica Chang', spots: 6 },
    { id: 'th2', time: '10:30 AM', name: 'Tower Pilates', instructor: 'Marcus Sterling', spots: 4 },
    { id: 'th3', time: '06:00 PM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 3 }
  ],
  Fri: [
    { id: 'f1', time: '07:00 AM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 8 },
    { id: 'f2', time: '12:00 PM', name: 'Mat Core Express', instructor: 'Jessica Chang', spots: 10 },
    { id: 'f3', time: '04:30 PM', name: 'TGIF Reformer Flow', instructor: 'Marcus Sterling', spots: 5 }
  ],
  Sat: [
    { id: 'sa1', time: '08:30 AM', name: 'Reformer Power Flow', instructor: 'Jessica Chang', spots: 2 },
    { id: 'sa2', time: '10:00 AM', name: 'Reformer Flow', instructor: 'Sarah Jenkins', spots: 0 },
    { id: 'sa3', time: '11:30 AM', name: 'Tower Sculpt', instructor: 'Marcus Sterling', spots: 6 }
  ],
  Sun: [
    { id: 'su1', time: '09:00 AM', name: 'Reformer Align', instructor: 'Sarah Jenkins', spots: 4 },
    { id: 'su2', time: '10:30 AM', name: 'Sunday Sanctuary Flow', instructor: 'Jessica Chang', spots: 1 }
  ]
};

// ==========================================
// 2. DOM Elements & State
// ==========================================
let currentTestimonialIndex = 0;
let testimonialInterval;

// Navbar & Menu
const navbar = document.getElementById('main-navbar');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const navLinksMenu = document.getElementById('nav-links-menu');
const navLinks = document.querySelectorAll('.nav-link-item');

// Booking Modal Elements
const bookingModal = document.getElementById('booking-modal-overlay');
const bookingModalClose = document.getElementById('booking-modal-close');
const bookingModalBackdrop = document.getElementById('booking-modal-backdrop');
const successCloseBtn = document.getElementById('success-close-btn');
const bookingWizardForm = document.getElementById('booking-wizard-form');
const bookingStep1 = document.getElementById('booking-step-1');
const bookingStep2 = document.getElementById('booking-step-2');
const bookingSuccessState = document.getElementById('booking-success-state');
const modalHeaderTitle = document.getElementById('modal-header-title');

// Wizard Form Fields
const inputPackage = document.getElementById('booking-package');
const inputDate = document.getElementById('booking-date');
const inputTime = document.getElementById('booking-time');
const step1NextBtn = document.getElementById('btn-step1-next');
const step2PrevBtn = document.getElementById('btn-step2-prev');

// CTA Buttons
const navBookBtn = document.getElementById('nav-book-btn');
const heroBookBtn = document.getElementById('hero-book-btn');

// Package Filter Tabs
const packageGrid = document.getElementById('pricing-grid-container');
const tabButtons = document.querySelectorAll('.tab-btn');

// Schedule Board Elements
const dayButtons = document.querySelectorAll('.day-btn');
const scheduleBoard = document.getElementById('schedule-list-board');

// Testimonials Elements
const testimonialSlides = document.querySelectorAll('.testimonial-slide');
const testimonialDots = document.querySelectorAll('.dot');
const testPrevBtn = document.getElementById('test-prev');
const testNextBtn = document.getElementById('test-next');

// Forms
const newsletterForm = document.getElementById('newsletter-subscription-form');
const newsletterEmail = document.getElementById('newsletter-email');
const newsletterSubmitBtn = document.getElementById('newsletter-submit-btn');

// ==========================================
// 3. Scroll Effect & Mobile Navigation Menu
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
// 4. Booking Wizard Modal Logic
// ==========================================
function openBookingModal(initialPackage = '', initialTime = '', initialDate = '') {
  // Reset form steps
  bookingStep1.classList.add('active');
  bookingStep2.classList.remove('active');
  bookingSuccessState.classList.remove('active');
  bookingWizardForm.style.display = 'block';
  modalHeaderTitle.textContent = 'Book a Pilates Session';
  
  // Preset Values
  if (initialPackage) {
    // Find closest option matching package name
    for (let i = 0; i < inputPackage.options.length; i++) {
      if (inputPackage.options[i].value.includes(initialPackage)) {
        inputPackage.selectedIndex = i;
        break;
      }
    }
  } else {
    inputPackage.selectedIndex = 0;
  }
  
  if (initialTime) {
    let matched = false;
    for (let i = 0; i < inputTime.options.length; i++) {
      if (inputTime.options[i].value.includes(initialTime)) {
        inputTime.selectedIndex = i;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Add custom temporary option if it doesn't match standard hours
      const newOption = new Option(initialTime, initialTime, true, true);
      inputTime.add(newOption);
    }
  } else {
    inputTime.selectedIndex = 0;
  }

  // Set minimum date to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  inputDate.min = `${yyyy}-${mm}-${dd}`;
  
  if (initialDate) {
    inputDate.value = initialDate;
  } else {
    inputDate.value = `${yyyy}-${mm}-${dd}`;
  }
  
  // Show Modal
  bookingModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
  bookingModal.classList.remove('active');
  document.body.style.overflow = 'auto';
  // Clear any dynamically added times when closing
  while (inputTime.options.length > 6) {
    inputTime.remove(6);
  }
}

// Modal open triggers
navBookBtn.addEventListener('click', () => openBookingModal());
heroBookBtn.addEventListener('click', () => openBookingModal());

// Select package buttons
document.querySelectorAll('.select-package-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const pkgName = e.currentTarget.getAttribute('data-package');
    openBookingModal(pkgName);
  });
});

// Modal close triggers
bookingModalClose.addEventListener('click', closeBookingModal);
bookingModalBackdrop.addEventListener('click', closeBookingModal);
successCloseBtn.addEventListener('click', closeBookingModal);

// Close on Escape Key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bookingModal.classList.contains('active')) {
    closeBookingModal();
  }
});

// Wizard Form Steps Navigation
step1NextBtn.addEventListener('click', () => {
  if (inputPackage.checkValidity() && inputDate.checkValidity() && inputTime.checkValidity()) {
    bookingStep1.classList.remove('active');
    bookingStep2.classList.add('active');
  } else {
    // Trigger validation styling
    bookingWizardForm.reportValidity();
  }
});

step2PrevBtn.addEventListener('click', () => {
  bookingStep2.classList.remove('active');
  bookingStep1.classList.add('active');
});

// Form Submission (Simulated API)
bookingWizardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('btn-step2-submit');
  const originalText = submitBtn.textContent;
  
  // Transition to submitting state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Reserving Spot...';
  
  setTimeout(() => {
    // Simulate successful API response
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    
    // Hide form steps and show success
    bookingWizardForm.style.display = 'none';
    bookingSuccessState.classList.add('active');
    modalHeaderTitle.textContent = 'Confirmation';
    
    // Reset form inputs
    bookingWizardForm.reset();
  }, 1200);
});

// ==========================================
// 5. Classes & Packages Tab Filters
// ==========================================
tabButtons.forEach(tab => {
  tab.addEventListener('click', (e) => {
    // Update active tab styling
    tabButtons.forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    const filter = e.currentTarget.getAttribute('data-filter');
    const cards = packageGrid.querySelectorAll('.pricing-card');
    
    cards.forEach(card => {
      const category = card.getAttribute('data-category');
      
      // Sophisticated CSS transition for filtering
      if (filter === 'all' || category === filter) {
        card.style.display = 'flex';
        // Minor delay to trigger CSS fade-in transition
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0) scale(1)';
        }, 10);
      } else {
        card.style.opacity = '0';
        card.style.transform = 'translateY(15px) scale(0.98)';
        // Wait for transition before hiding layout
        setTimeout(() => {
          card.style.display = 'none';
        }, 300);
      }
    });
  });
});

// ==========================================
// 6. Interactive Studio Schedule Board
// ==========================================
function renderSchedule(day) {
  // Update Active Filter Button
  dayButtons.forEach(btn => {
    if (btn.getAttribute('data-day') === day) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  const classes = scheduleData[day] || [];
  
  if (classes.length === 0) {
    scheduleBoard.innerHTML = `<div class="schedule-no-classes">No classes scheduled for this day.</div>`;
    return;
  }
  
  // Build and render list items
  scheduleBoard.innerHTML = classes.map(cls => {
    const isFull = cls.spots === 0;
    const isLow = cls.spots > 0 && cls.spots <= 3;
    
    let spotsText = `${cls.spots} spots left`;
    let spotsClass = '';
    let btnText = 'Book Spot';
    let btnClass = 'btn btn-primary';
    let btnDisabled = '';
    
    if (isFull) {
      spotsText = 'Fully Booked';
      spotsClass = 'low-spots';
      btnText = 'Waitlist';
      btnClass = 'btn btn-secondary';
    } else if (isLow) {
      spotsClass = 'low-spots';
    }
    
    return `
      <div class="schedule-item" id="schedule-item-${cls.id}">
        <div class="sched-time">${cls.time}</div>
        <div class="sched-class-title">${cls.name}</div>
        <div class="sched-instructor">${cls.instructor}</div>
        <div class="sched-spots ${spotsClass}">${spotsText}</div>
        <div>
          <button class="btn ${btnClass} sched-book-btn" 
            data-class-name="${cls.name}" 
            data-time="${cls.time}" 
            data-day="${day}" 
            id="btn-sched-${cls.id}"
            ${btnDisabled}>
            ${btnText}
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Re-bind click event listeners to new schedule buttons
  document.querySelectorAll('.sched-book-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clsName = e.currentTarget.getAttribute('data-class-name');
      const timeVal = e.currentTarget.getAttribute('data-time');
      const dayVal = e.currentTarget.getAttribute('data-day');
      
      // Generate formatted date (e.g. next matching day)
      const dayMapping = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const targetDayOfWeek = dayMapping[dayVal];
      
      const today = new Date();
      const currentDayOfWeek = today.getDay();
      let diff = targetDayOfWeek - currentDayOfWeek;
      if (diff < 0) diff += 7; // Next week
      
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + diff);
      
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const formattedDate = `${yyyy}-${mm}-${dd}`;
      
      openBookingModal(clsName, timeVal, formattedDate);
    });
  });
}

// Attach Day Button Click Handlers
dayButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const day = e.currentTarget.getAttribute('data-day');
    renderSchedule(day);
  });
});

// Initial Render for Monday
renderSchedule('Mon');

// ==========================================
// 7. Testimonials Slider Carousel
// ==========================================
function showTestimonial(index) {
  testimonialSlides.forEach(slide => slide.classList.remove('active'));
  testimonialDots.forEach(dot => dot.classList.remove('active'));
  
  currentTestimonialIndex = (index + testimonialSlides.length) % testimonialSlides.length;
  
  testimonialSlides[currentTestimonialIndex].classList.add('active');
  testimonialDots[currentTestimonialIndex].classList.add('active');
}

function nextTestimonial() {
  showTestimonial(currentTestimonialIndex + 1);
}

function prevTestimonial() {
  showTestimonial(currentTestimonialIndex - 1);
}

// Event Listeners
testNextBtn.addEventListener('click', () => {
  nextTestimonial();
  resetTestimonialTimer();
});

testPrevBtn.addEventListener('click', () => {
  prevTestimonial();
  resetTestimonialTimer();
});

testimonialDots.forEach(dot => {
  dot.addEventListener('click', (e) => {
    const slideIdx = parseInt(e.currentTarget.getAttribute('data-slide'));
    showTestimonial(slideIdx);
    resetTestimonialTimer();
  });
});

// Automatic Interval Transitions (6 seconds)
function startTestimonialTimer() {
  testimonialInterval = setInterval(nextTestimonial, 6000);
}

function resetTestimonialTimer() {
  clearInterval(testimonialInterval);
  startTestimonialTimer();
}

// Start Timer initially
startTestimonialTimer();

// ==========================================
// 8. Newsletter Form Logic
// ==========================================
newsletterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  newsletterSubmitBtn.disabled = true;
  newsletterSubmitBtn.textContent = 'Subscribing...';
  
  setTimeout(() => {
    newsletterSubmitBtn.textContent = 'Subscribed!';
    newsletterEmail.value = '';
    newsletterEmail.disabled = true;

    newsletterSubmitBtn.style.backgroundColor = 'var(--secondary)';
    newsletterSubmitBtn.style.borderColor = 'var(--secondary)';

    setTimeout(() => {
      // Keep it in subscribed state but restore button style if needed
    }, 2000);
  }, 1000);
});

// ==========================================
// 9. Scroll Reveal Animations
// ==========================================
const revealSelectors = [
  '.section-header',
  '.method-card',
  '.pricing-card',
  '.stat-item',
  '.instructor-card',
  '.gallery-item',
  '.schedule-container',
  '.testimonials-slider-container',
  '.contact-grid > *'
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
// 10. 3D Card Tilt on Mouse Move
// ==========================================
function addTilt(el) {
  el.addEventListener('mouseenter', () => {
    el.style.transition = 'transform 0.1s ease, box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  });

  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const tiltX = (y - 0.5) * 14;
    const tiltY = (0.5 - x) * 14;
    el.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-6px) scale(1.01)`;
  });

  el.addEventListener('mouseleave', () => {
    el.style.transition = 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
    el.style.transform = '';
  });
}

document.querySelectorAll('.method-card, .pricing-card, .instructor-card').forEach(addTilt);

// ==========================================
// 11. Animated Counters
// ==========================================
function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const duration = 2400;
  let startTime = null;

  function step(currentTime) {
    if (!startTime) startTime = currentTime;
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

const statsSection = document.querySelector('.stats-section');
if (statsSection) {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.stat-number').forEach(animateCounter);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  counterObserver.observe(statsSection);
}

// ==========================================
// 12. Hero Blob Parallax on Scroll
// ==========================================
const heroBlobs = document.querySelectorAll('.hero-blob');
if (heroBlobs.length) {
  const speeds = [0.13, 0.08, 0.05];
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    if (scrolled < window.innerHeight * 1.5) {
      heroBlobs.forEach((blob, i) => {
        blob.style.transform = `translateY(${scrolled * speeds[i]}px)`;
      });
    }
  }, { passive: true });
}
