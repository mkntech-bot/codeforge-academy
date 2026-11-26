
import { Link } from "react-router-dom";

function Landing() {
  return (
    <div className="landing-page">

      {/* NAVIGATION */}
      <nav className="navbar">
        <Link to="/" className="brand">
          <div className="brand-icon">CF</div>
          <span>CodeForge<span className="brand-highlight"> Academy</span></span>
        </Link>

        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <Link to="/admin-login" className="nav-admin">
            Admin Login
          </Link>
          <Link to="/register" className="nav-register">
            Join Academy <span>↗</span>
          </Link>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main>
        <section className="hero">
          <div className="hero-content">

            <div className="hero-badge">
              <span className="status-dot"></span>
              WELCOME TO CODEFORGE ACADEMY
            </div>

            <h1>
              Turn your ideas into
              <span className="gradient-text"> real code.</span>
            </h1>

            <p className="hero-description">
              A place where curious minds learn programming,
              develop practical skills, solve problems and build
              amazing things through code.
            </p>

            <div className="hero-buttons">
              <Link to="/register" className="primary-button">
                Get Started <span>→</span>
              </Link>

              <Link to="/student-assignments" className="secondary-button">
                Take an Assignment
              </Link>

              <a href="#about" className="secondary-button">
                Explore Academy
              </a>
            </div>

            <div className="hero-note">
              <span>✦</span> Learn. Code. Build.
            </div>
          </div>

          {/* CODE PREVIEW */}
          <div className="code-window">
            <div className="code-window-header">
              <div className="window-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="file-name">hello_world.py</span>
              <span className="file-language">PYTHON</span>
            </div>

            <div className="code-content">
              <div><span className="line-number">01</span> <span className="code-purple">class</span> <span className="code-yellow">Developer</span>:</div>
              <div><span className="line-number">02</span> &nbsp;&nbsp;<span className="code-purple">def</span> <span className="code-blue">__init__</span>(self):</div>
              <div><span className="line-number">03</span> &nbsp;&nbsp;&nbsp;&nbsp;self.name = <span className="code-green">"Future Coder"</span></div>
              <div><span className="line-number">04</span> &nbsp;&nbsp;&nbsp;&nbsp;self.skills = []</div>
              <div><span className="line-number">05</span></div>
              <div><span className="line-number">06</span> &nbsp;&nbsp;<span className="code-purple">def</span> <span className="code-blue">learn</span>(self):</div>
              <div><span className="line-number">07</span> &nbsp;&nbsp;&nbsp;&nbsp;<span className="code-purple">return</span> <span className="code-green">"Keep building!"</span></div>
              <div><span className="line-number">08</span></div>
              <div><span className="line-number">09</span> student = <span className="code-yellow">Developer</span>()</div>
              <div><span className="line-number">10</span> <span className="code-blue">print</span>(student.learn())</div>
            </div>

            <div className="code-output">
              <span className="output-icon">▶</span>
              <span>Keep building!</span>
              <span className="output-success">Process finished</span>
            </div>
          </div>

          <div className="hero-glow"></div>
        </section>

        {/* ABOUT */}
        <section className="about-section" id="about">
          <div className="section-label">ABOUT THE ACADEMY</div>

          <h2>
            More than learning.
            <span className="gradient-text"> It's about building.</span>
          </h2>

          <p>
            CodeForge Academy is a programming learning community
            focused on helping students understand coding through
            practical lessons, assignments and real-world projects.
            We believe the best way to learn programming is to write code
            and create something meaningful.
          </p>
        </section>

        {/* FEATURES */}
        <section className="features-section" id="features">
          <div className="section-label">THE CODEFORGE EXPERIENCE</div>
          <h2>Learn by doing.</h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⌨</div>
              <h3>Practical Coding</h3>
              <p>Learn programming by writing code and solving practical problems.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◈</div>
              <h3>Assignments</h3>
              <p>Test your knowledge through coding challenges and exercises.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">✦</div>
              <h3>Track Progress</h3>
              <p>Submit your work, receive feedback and check your published results.</p>
            </div>
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="join-section">
          <div className="section-label">YOUR JOURNEY STARTS HERE</div>
          <h2>Ready to start building?</h2>
          <p>Join CodeForge Academy and take your first step into programming.</p>
          <Link to="/register" className="primary-button">
            Register Now <span>→</span>
          </Link>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <Link to="/" className="brand">
          <div className="brand-icon">CF</div>
          <span>CodeForge<span className="brand-highlight"> Academy</span></span>
        </Link>

        <p>Learn. Code. Build.</p>
        <span className="copyright">
          © {new Date().getFullYear()} CodeForge Academy. All rights reserved.
        </span>
      </footer>

    </div>
  );
}

export default Landing;
