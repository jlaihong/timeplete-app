import React, { useRef, useState, useEffect } from "react";
import { Link } from "expo-router";
import { landingPageCss } from "./landingPageCss";
import {
  useLandingPageScrollContainer,
  useLandingSectionObserver,
} from "./useLandingPageScroll.web";

const LANDING_IMAGES = {
  hero: "/landing/yearly_analytics.png",
  track: "/landing/track.png",
  plan: "/landing/track_time.png",
  today: "/landing/today.png",
  analyticsVideo: "/landing/analytics_loop.mp4",
  reflect: "/landing/reflect.png",
  goals: "/landing/list-sections.png",
} as const;

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [navScrolled, setNavScrolled] = useState(false);

  useLandingPageScrollContainer();
  useLandingSectionObserver(rootRef);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncNavScrolled = () => {
      setNavScrolled(root.scrollTop > 24);
    };

    syncNavScrolled();
    root.addEventListener("scroll", syncNavScrolled, { passive: true });
    return () => root.removeEventListener("scroll", syncNavScrolled);
  }, []);

  return (
    <div ref={rootRef} className="landing-root">
      <style dangerouslySetInnerHTML={{ __html: landingPageCss }} />

      <nav className={`landing-nav${navScrolled ? " scrolled" : ""}`}>
        <Link href="/landing" className="nav-brand">
          Timeplete <span className="beta-badge">(beta)</span>
        </Link>
        <div className="nav-actions">
          <Link href="/login" className="nav-login">
            Log in
          </Link>
          <Link href="/signup" className="nav-cta">
            Start free
          </Link>
        </div>
      </nav>

      <main className="landing-main">
        <section
          className="landing-section hero-section landing-visible"
          id="hero"
        >
          <div className="section-inner hero-inner">
            <div className="hero-content">
              <h1 className="hero-headline">
                Understand your time. Upgrade your life.
              </h1>
              <p className="hero-subheading">
                Track tasks, habits, and daily activity in one system — then turn
                your data into clear personal insight.
              </p>
              <p className="hero-supporting">
                Built for people who want to improve every week, not just plan
                it.
              </p>
              <div className="hero-ctas">
                <Link href="/signup" className="btn-primary">
                  Start free
                </Link>
                <Link href="/login" className="btn-secondary">
                  Log in
                </Link>
              </div>
            </div>
            <div className="hero-image-wrap">
              <img
                src={LANDING_IMAGES.hero}
                alt="Dashboard overview"
                className="section-image hero-image"
              />
            </div>
          </div>
        </section>

        <section className="landing-section track-section" id="track">
          <div className="section-inner two-col">
            <div className="section-image-wrap">
              <img
                src={LANDING_IMAGES.track}
                alt="Track what matters"
                className="section-image"
              />
            </div>
            <div className="section-content">
              <h2 className="section-headline">
                Your life is more than a to-do list.
              </h2>
              <p className="section-subheading">
                Monitor mood, health, learning, routines, and the metrics that
                actually shape your progress.
              </p>
              <p className="section-body">
                Create custom trackables, build streaks automatically, and see how
                consistency compounds over time.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section plan-section" id="plan">
          <div className="section-inner two-col reverse">
            <div className="section-image-wrap">
              <img
                src={LANDING_IMAGES.plan}
                alt="Plan and execute"
                className="section-image"
              />
            </div>
            <div className="section-content">
              <h2 className="section-headline">
                Plan the work. Track the reality.
              </h2>
              <p className="section-subheading">
                Organize tasks by day, stay focused, and know exactly how long
                everything really takes.
              </p>
              <p className="section-body">
                Start timers, log effort, and build an accurate picture of where
                your time goes — without extra admin.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section today-section" id="today">
          <div className="section-inner two-col">
            <div className="section-image-wrap">
              <img
                src={LANDING_IMAGES.today}
                alt="Your day at a glance"
                className="section-image"
              />
            </div>
            <div className="section-content">
              <h2 className="section-headline">Your day, at a glance.</h2>
              <p className="section-subheading">
                Tasks and calendar events together, so nothing competes for your
                attention.
              </p>
              <p className="section-body">
                Make better decisions in the moment with a complete, real-time
                view of your commitments.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section analytics-section" id="analytics">
          <div className="section-inner center-section">
            <h2 className="section-headline center-headline">
              Turn activity into insight.
            </h2>
            <p className="section-subheading center-subheading">
              Daily, weekly, monthly, and yearly views reveal patterns you can't
              see while you're busy.
            </p>
            <p className="section-body center-body">
              Understand where time is invested, what drives results, and where
              adjustments create the biggest gains.
            </p>
            <div className="center-image-wrap">
              <video
                className="section-image center-image center-video"
                autoPlay
                loop
                muted
                playsInline
                aria-label="Analytics dashboard in action"
              >
                <source
                  src={LANDING_IMAGES.analyticsVideo}
                  type="video/mp4"
                />
              </video>
            </div>
          </div>
        </section>

        <section className="landing-section reflect-section" id="reflect">
          <div className="section-inner two-col reverse">
            <div className="section-image-wrap">
              <img
                src={LANDING_IMAGES.reflect}
                alt="Reflection and growth"
                className="section-image"
              />
            </div>
            <div className="section-content">
              <h2 className="section-headline">Improve on purpose.</h2>
              <p className="section-subheading">
                Capture wins, lessons, and adjustments with structured reviews
                that make progress inevitable.
              </p>
              <p className="section-body">
                Your future performance is built from intentional reflection —
                not memory.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section goals-section" id="goals">
          <div className="section-inner two-col">
            <div className="section-image-wrap">
              <img
                src={LANDING_IMAGES.goals}
                alt="Organize bigger goals"
                className="section-image"
              />
            </div>
            <div className="section-content">
              <h2 className="section-headline">
                Big ambitions need structure.
              </h2>
              <p className="section-subheading">
                Break projects into lists, sections, and actionable steps that
                keep momentum high.
              </p>
              <p className="section-body">
                From long-term strategy to today's execution, everything stays
                connected.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section cta-section" id="cta">
          <div className="section-inner cta-inner">
            <h2 className="section-headline cta-headline">
              If you can measure it, you can improve it.
            </h2>
            <p className="section-subheading cta-subheading">
              Start building awareness, consistency, and momentum today.
            </p>
            <Link href="/signup" className="btn-primary btn-cta">
              Start free
            </Link>
            <p className="cta-reassurance">
              14 day free trial. No credit card required.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
