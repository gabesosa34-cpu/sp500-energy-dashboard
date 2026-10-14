// Shared cross-page UI behavior: nav scroll state + scroll-triggered reveals.
// No data, calculations, or report content here — presentation only.

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nav goes solid once the hero has scrolled past.
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Fade-up report sections once, on first intersection.
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('in-view'));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
      reveals.forEach((el) => io.observe(el));
    }
  }
})();
