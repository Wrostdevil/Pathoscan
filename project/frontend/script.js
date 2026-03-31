  /* ── Scroll reveal ───────────────────────────────── */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  /* ── Billing toggle ──────────────────────────────── */
  let isYearly = false;
  function toggleBilling() {
    isYearly = !isYearly;
    document.getElementById('billingToggle').classList.toggle('yearly', isYearly);
    const priceEl = document.querySelector('.price-val');
    if (priceEl) priceEl.textContent = isYearly ? '63' : '79';
  }

  /* ── FAQ accordion ───────────────────────────────── */
  function toggleFaq(el) {
    const answer = el.nextElementSibling;
    const arrow = el.querySelector('.arrow');
    const isOpen = answer.classList.contains('open');
    document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));
    document.querySelectorAll('.faq-q .arrow').forEach(a => a.classList.remove('open'));
    if (!isOpen) { answer.classList.add('open'); arrow.classList.add('open'); }
  }

  /* ── SHA mock ────────────────────────────────────── */
  function generateMockSHA() {
    const c = 'abcdef0123456789'; let h = '';
    for (let i = 0; i < 32; i++) h += c.charAt(Math.floor(Math.random() * c.length));
    return h;
  }

  /* ── Markdown formatter ──────────────────────────── */
  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--green);">$1</strong>')
      .replace(/^\* (.*?)$/gm, '&bull; $1')
      .replace(/\n/g, '<br>');
  }

  /* ── Typewriter ──────────────────────────────────── */
  function typeWriter(elementId, htmlText, speed) {
    const el = document.getElementById(elementId);
    el.innerHTML = '';
    let i = 0, isTag = false, current = '';
    function type() {
      if (i < htmlText.length) {
        const ch = htmlText.charAt(i);
        current += ch;
        if (ch === '<') isTag = true;
        if (ch === '>') isTag = false;
        el.innerHTML = current + '<span class="cursor"></span>';
        i++;
        isTag ? type() : setTimeout(type, speed);
      } else { el.innerHTML = current; }
    }
    type();
  }

  /* ── Predictor ───────────────────────────────────── */
  async function runPredict() {
    const data = {
      chrom: document.getElementById('f_chrom').value,
      pos: Number(document.getElementById('f_pos').value),
      ref: document.getElementById('f_ref').value,
      alt: document.getElementById('f_alt').value,
      gnomad_af: Number(document.getElementById('f_gnomad').value),
      GERP_91_mammals_rankscore: Number(document.getElementById('f_gerp').value),
      phyloP100way_vertebrate_rankscore: Number(document.getElementById('f_pp100').value),
      phyloP470way_mammalian_rankscore: Number(document.getElementById('f_pp470').value),
      phastCons470way_mammalian_rankscore: Number(document.getElementById('f_pc470').value),
      phastCons17way_primate_rankscore: Number(document.getElementById('f_pc17').value),
    };
    document.getElementById('resultPanel').classList.remove('on');
    document.getElementById('loadBox').classList.add('on');
    document.getElementById('runBtn').disabled = true;
    document.getElementById('gemini-text').innerHTML = "Generating AI insights... <span class='cursor'></span>";

    try {
      const res = await fetch("http://127.0.0.1:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      renderOutput(result, data);
    } catch (err) {
      console.warn("Backend offline — Demo Mode:", err);
      setTimeout(() => {
        renderOutput({
          pathogenic_probability: 0.74,
          top_features: [
            ["GERP_91_mammals_rankscore", 1.85], ["phastCons17way_primate_rankscore", 1.42],
            ["gnomad_af", -1.35], ["phyloP100way_vertebrate_rankscore", 0.98],
            ["phyloP470way_mammalian_rankscore", 0.64], ["phastCons470way_mammalian_rankscore", 0.45],
            ["chrom", -0.25], ["ref", -0.12], ["alt", 0.08], ["pos", 0.02]
          ],
          clinical_note: "**Demo Mode:** Backend not detected. This is a simulated result.\n\n**Variant:** chr" + data.chrom + ":" + data.pos + " " + data.ref + ">" + data.alt + "\n\n**Finding:** Based on the conservation scores provided, this variant shows moderate evolutionary constraint. **GERP_91_mammals_rankscore** was the strongest predictor, pushing toward pathogenicity. The relatively **low gnomAD allele frequency** (common = benign signal) provided a counterbalancing effect.\n\nStart the FastAPI backend (`uvicorn app:app --reload`) on port 8000 to run live predictions.\n\nThis is for decision-support purposes only."
        }, data);
      }, 1500);
    }
  }

  function renderOutput(result, data) {
    document.getElementById('loadBox').classList.remove('on');
    document.getElementById('runBtn').disabled = false;
    if (result.error) { alert("Backend Error: " + result.error); return; }

    const prob = result.pathogenic_probability || 0;
    const isP = prob >= 0.5;

    document.getElementById('resultPanel').classList.add('on');
    document.getElementById('verdictBox').className = 'verdict ' + (isP ? 'P' : 'B');
    document.getElementById('v-tag').textContent = isP ? 'High Risk' : 'Likely Benign';
    document.getElementById('v-name').textContent = isP ? 'PATHOGENIC' : 'BENIGN';
    document.getElementById('v-prob-text').textContent = (prob * 100).toFixed(2) + '%';
    document.getElementById('sha-id').textContent = 'SHA256: ' + generateMockSHA();

    const sc = document.getElementById('shapContainer');
    sc.innerHTML = result.top_features.map((fd, i) => {
      const [name, val] = fd;
      const isPos = val > 0;
      const w = Math.min(Math.abs(val) * 30, 100);
      return `<div class="shap-row" style="animation-delay:${i * 0.1}s">
        <span class="shap-name">${name}</span>
        <div class="shap-track">
          <div class="shap-fill-left" style="width:${!isPos ? w : 0}%"></div>
          <div class="shap-fill-right" style="width:${isPos ? w : 0}%"></div>
        </div>
        <span class="shap-val">${val.toFixed(3)}</span>
      </div>`;
    }).join('');

    document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (result.clinical_note) {
      typeWriter('gemini-text', formatMarkdown(result.clinical_note), 4);
    }
  }
