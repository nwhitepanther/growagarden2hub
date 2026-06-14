document.addEventListener("DOMContentLoaded", () => {
  const video = document.querySelector(".hero-video");
  if (video) {
    video.muted = true;
    video.play().catch(() => {
      /* Autoplay may be blocked until user interaction */
    });
  }

  const scrollBtn = document.querySelector(".scroll-btn");
  if (scrollBtn) {
    scrollBtn.addEventListener("click", () => {
      window.scrollBy({ top: window.innerHeight * 0.6, behavior: "smooth" });
    });
  }

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
});
