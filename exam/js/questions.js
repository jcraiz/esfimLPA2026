/**
 * ESFIM Exam Delivery — Question Renderer & Answer Collector
 * Supports 5 question types: mc, tf, fb, mr, matching.
 */
const ESFIMQuestions = (() => {

  /**
   * Render a stack of question cards
   * @param {Array} questions - array of question objects
   * @param {object} answers - current answers object { [qId]: answer }
   * @param {object} flags - flagged questions object { [qId]: true }
   * @param {string} sectionKey - e.g. 'vocab', 'grammar', 'reading_0', 'listening_0'
   * @returns {string} HTML string
   */
  function renderQuestionStack(questions, answers, flags, sectionKey) {
    if (!questions || questions.length === 0) {
      return `<div class="p-6 text-center text-muted">No questions available in this section.</div>`;
    }

    return questions.map((q, idx) => {
      const qId = q.id;
      const currentAns = answers[qId];
      // Flag key is just qId — consistent with attempt.flaggedQuestions storage
      const isFlagged = !!(flags && flags[qId]);
      const isAnswered = currentAns !== undefined && currentAns !== null && currentAns !== '' &&
                         (!Array.isArray(currentAns) || currentAns.length > 0) &&
                         (typeof currentAns !== 'object' || Object.keys(currentAns).length > 0);

      let cardClasses = 'exam-q-card notranslate';
      if (isAnswered) cardClasses += ' answered';
      if (isFlagged) cardClasses += ' flagged';

      return `
        <div class="${cardClasses}" id="qcard-${qId}" translate="no">
          <div class="q-card-top">
            <span class="q-number-chip">Question ${idx + 1}</span>
            <button type="button" class="flag-btn ${isFlagged ? 'active' : ''}"
                    id="flagbtn-${qId}"
                    onclick="ESFIMQuestions.toggleFlag('${qId}')"
                    aria-label="${isFlagged ? 'Unflag question' : 'Flag question for review'}"
                    aria-pressed="${isFlagged}"
                    title="${isFlagged ? 'Remove flag' : 'Flag for review'}">
              ${isFlagged ? `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px;fill:currentColor"')} Flagged` : `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px"')} Flag`}
            </button>
          </div>

          <div class="q-text">${escapeHtml(q.text)}</div>

          <div class="q-options-container">
            ${renderQuestionInput(q, currentAns, sectionKey)}
          </div>
        </div>`;
    }).join('');
  }

  /**
   * Render input elements for specific question type
   */
  function renderQuestionInput(q, currentAns, sectionKey) {
    const qId = q.id;

    switch (q.type) {
      case 'mc': {
        const opts = q.options || [];
        return opts.map((opt, oi) => {
          const inputId = `opt_${qId}_${oi}`;
          const checked = String(currentAns) === String(opt);
          const letter = String.fromCharCode(65 + oi);
          return `
            <label for="${inputId}" class="option-label" tabindex="0">
              <input type="radio" id="${inputId}" name="q_${qId}" value="${escapeHtml(opt)}" ${checked ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', this.value)">
              <span class="option-letter" aria-hidden="true">${letter}</span>
              <span class="option-text">${escapeHtml(opt)}</span>
            </label>`;
        }).join('');
      }

      case 'tf': {
        const isTrue = String(currentAns) === 'true';
        const isFalse = String(currentAns) === 'false';
        return `
          <div class="flex gap-3 tf-options-row">
            <label for="opt_${qId}_true" class="option-label tf-option" style="flex:1" tabindex="0">
              <input type="radio" id="opt_${qId}_true" name="q_${qId}" value="true" ${isTrue ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', 'true')">
              <span class="option-letter" aria-hidden="true">T</span>
              <span class="option-text">True</span>
            </label>
            <label for="opt_${qId}_false" class="option-label tf-option" style="flex:1" tabindex="0">
              <input type="radio" id="opt_${qId}_false" name="q_${qId}" value="false" ${isFalse ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', 'false')">
              <span class="option-letter" aria-hidden="true">F</span>
              <span class="option-text">False</span>
            </label>
          </div>`;
      }

      case 'fb': {
        const val = typeof currentAns === 'string' ? currentAns : '';
        return `
          <input type="text" id="fb_${qId}" aria-label="Answer for question ${escapeHtml(qId)}" class="fb-input" value="${escapeHtml(val)}" placeholder="Type your answer here..."
                 oninput="ESFIMQuestions.handleInput('${qId}', this.value)">`;
      }

      case 'mr': {
        const opts = q.options || [];
        const selectedArr = Array.isArray(currentAns) ? currentAns : [];
        return opts.map((opt, oi) => {
          const inputId = `mr_${qId}_${oi}`;
          const checked = selectedArr.includes(opt);
          const letter = String.fromCharCode(65 + oi);
          return `
            <label for="${inputId}" class="option-label mr-option" tabindex="0">
              <input type="checkbox" id="${inputId}" name="q_${qId}" value="${escapeHtml(opt)}" ${checked ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleMRChange('${qId}')">
              <span class="option-letter mr-letter" aria-hidden="true">${letter}</span>
              <span class="option-text">${escapeHtml(opt)}</span>
            </label>`;
        }).join('');
      }

      case 'matching': {
        const pairs = q.pairs || [];
        const currentMap = (currentAns && typeof currentAns === 'object') ? currentAns : {};
        const rightChoices = getOrShuffleMatchingChoices(q);

        return `
          <div class="matching-container">
            ${pairs.map((p, pi) => {
              const rawLeft = String(p.left || '');
              const selectedVal = currentMap[rawLeft] || '';
              const selectId = `matching_${qId}_${pi}`;
              // Store the raw (unescaped) left key in a data attribute so
              // handleMatchingChange can read it without HTML-decoding issues.
              return `
                <div class="matching-row" data-matching-left="${escapeHtml(rawLeft)}">
                  <div class="matching-left">${escapeHtml(rawLeft)}</div>
                  <span style="color:var(--clr-text-muted)">→</span>
                  <select id="${selectId}" aria-label="Matching selection for ${escapeHtml(rawLeft)}" class="matching-select"
                          onchange="ESFIMQuestions.handleMatchingChange('${qId}', this)">
                    <option value="">-- Select --</option>
                    ${rightChoices.map(rc => `
                      <option value="${escapeHtml(rc)}" ${String(selectedVal) === String(rc) ? 'selected' : ''}>
                        ${escapeHtml(rc)}
                      </option>`).join('')}
                  </select>
                </div>`;
            }).join('')}
          </div>`;
      }

      default:
        return `<div class="text-error">Unknown question type: ${q.type}</div>`;
    }
  }

  /**
   * Fisher-Yates array shuffle helper
   */
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Get or generate shuffled right-side choices for a matching question.
   * Guarantees that the options presented in dropdowns are shuffled and not in answer-key order.
   */
  function getOrShuffleMatchingChoices(q) {
    if (!q) return [];
    const pairs = Array.isArray(q.pairs) ? q.pairs : [];
    const originalRights = pairs.map(p => String(p.right || '').trim()).filter(s => s.length > 0);

    // 1. Check if valid pre-shuffled choices already exist on the question
    let candidate = null;
    if (Array.isArray(q.shuffledRight) && q.shuffledRight.some(s => String(s || '').trim().length > 0)) {
      candidate = q.shuffledRight;
    } else if (Array.isArray(q.shuffledRightChoices) && q.shuffledRightChoices.some(s => String(s || '').trim().length > 0)) {
      candidate = q.shuffledRightChoices;
    } else if (Array.isArray(q.rightChoices) && q.rightChoices.some(s => String(s || '').trim().length > 0)) {
      candidate = q.rightChoices;
    }

    if (candidate && candidate.length > 0) {
      const cleanCandidate = candidate.map(s => String(s || '').trim()).filter(s => s.length > 0);
      const isIdenticalToUnshuffled = originalRights.length > 1 &&
        cleanCandidate.length === originalRights.length &&
        cleanCandidate.every((val, idx) => val === originalRights[idx]) &&
        new Set(originalRights).size > 1;

      if (!isIdenticalToUnshuffled) {
        return cleanCandidate;
      }
    }

    // 2. Build and shuffle from available options pool
    let pool = (candidate && candidate.length > 0) ? candidate : originalRights;
    pool = pool.map(s => String(s || '').trim()).filter(s => s.length > 0);

    if (pool.length <= 1) {
      q.shuffledRight = pool;
      q.shuffledRightChoices = pool;
      q.rightChoices = pool;
      return pool;
    }

    let shuffled = shuffleArray(pool);
    const hasDistinct = new Set(pool).size > 1;
    let attempts = 0;
    while (hasDistinct && attempts < 10 && shuffled.every((v, i) => v === pool[i])) {
      shuffled = shuffleArray(pool);
      attempts++;
    }
    if (hasDistinct && shuffled.every((v, i) => v === pool[i])) {
      shuffled = [...pool.slice(1), pool[0]];
    }

    // Cache on question object for stable dropdown choices across re-renders
    q.shuffledRight = shuffled;
    q.shuffledRightChoices = shuffled;
    q.rightChoices = shuffled;
    return shuffled;
  }

  // Registry for callbacks
  let _onAnswerCb = null;
  let _onFlagCb = null;

  function registerCallbacks(onAnswer, onFlag) {
    _onAnswerCb = onAnswer;
    _onFlagCb = onFlag;
  }

  function handleInput(qId, val) {
    if (_onAnswerCb) _onAnswerCb(qId, val);
  }

  function handleMRChange(qId) {
    const checkedBoxes = document.querySelectorAll(`input[type="checkbox"][name="q_${qId}"]:checked`);
    const allBoxes = document.querySelectorAll(`input[type="checkbox"][name="q_${qId}"]`);
    allBoxes.forEach(cb => {
      const lbl = cb.closest('label');
      if (lbl) lbl.classList.toggle('selected', cb.checked);
    });
    const vals = Array.from(checkedBoxes).map(cb => cb.value);
    if (_onAnswerCb) _onAnswerCb(qId, vals);
  }
  function handleMatchingChange(qId, selectEl) {
    const container = (selectEl && selectEl.closest('.matching-container')) ||
                      document.getElementById(`matching-${qId}`) ||
                      document.getElementById(`qcard-${qId}`);
    if (!container) return;
    const rows = container.querySelectorAll('.matching-row');
    const mapping = {};
    rows.forEach(row => {
      const leftKey = (row.getAttribute('data-matching-left') || '').trim();
      const sel = row.querySelector('.matching-select');
      if (leftKey && sel && sel.value) {
        mapping[leftKey] = sel.value;
      }
    });
    if (_onAnswerCb) _onAnswerCb(qId, mapping);
  }

  /**
   * Toggle flag on a question card.
   * Calls _onFlagCb(qId) — the app determines the new state and updates the DOM.
   */
  function toggleFlag(qId) {
    if (_onFlagCb) _onFlagCb(qId);
  }

  /**
   * Render a single question card (Stitch 2026 UX)
   */
  function renderSingleQuestionCard(q, idx, total, answers, flags, sectionKey) {
    if (!q) {
      return `<div class="p-6 text-center text-muted">No question available.</div>`;
    }

    const qId = q.id;
    const currentAns = answers ? answers[qId] : undefined;
    const isFlagged = !!(flags && flags[qId]);
    const isAnswered = currentAns !== undefined && currentAns !== null && currentAns !== '' &&
                       (!Array.isArray(currentAns) || currentAns.length > 0) &&
                       (typeof currentAns !== 'object' || Object.keys(currentAns).length > 0);

    const typeLabels = {
      mc: 'Multiple Choice',
      tf: 'True / False',
      fb: 'Fill in the Blank',
      mr: 'Multiple Response',
      matching: 'Matching'
    };
    const typeLabel = typeLabels[q.type] || 'Question';

    return `
      <div class="stitch-q-meta-bar">
        <div class="stitch-q-title-group">
          <span class="stitch-q-number">Question ${idx + 1}</span>
          <span class="stitch-q-badge">${q.marks || 1} Point${(q.marks || 1) === 1 ? '' : 's'} · ${typeLabel}</span>
        </div>
        <button type="button" class="stitch-flag-btn ${isFlagged ? 'active' : ''}"
                id="flagbtn-${qId}"
                onclick="ESFIMQuestions.toggleFlag('${qId}')"
                aria-label="${isFlagged ? 'Unflag question' : 'Flag question for review'}"
                aria-pressed="${isFlagged}"
                title="${isFlagged ? 'Remove flag' : 'Flag for review'}">
          ${isFlagged ? `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px;fill:currentColor"')} Flagged` : `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px"')} Flag for Review`}
        </button>
      </div>

      <div class="stitch-stem-card exam-q-card notranslate ${isAnswered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''}" id="qcard-${qId}" translate="no">
        <div class="stitch-stem-text q-text">${escapeHtml(q.text)}</div>
      </div>

      <div class="q-options-container stitch-options-stack">
        ${renderQuestionInput(q, currentAns, sectionKey)}
      </div>
    `;
  }

  /**
   * Update flag button and card appearance in-place (called by exam-app after state update)
   */
  function updateFlagDisplay(qId, isFlagged) {
    const card = document.getElementById(`qcard-${qId}`);
    const btn = document.getElementById(`flagbtn-${qId}`);
    if (card) {
      card.classList.toggle('flagged', isFlagged);
    }
    if (btn) {
      btn.classList.toggle('active', isFlagged);
      btn.setAttribute('aria-pressed', String(isFlagged));
      btn.setAttribute('aria-label', isFlagged ? 'Unflag question' : 'Flag question for review');
      btn.setAttribute('title', isFlagged ? 'Remove flag' : 'Flag for review');
      btn.innerHTML = isFlagged ? `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px;fill:currentColor"')} Flagged` : `${getIcon('flag', 'width="14" height="14" style="margin-right:4px;vertical-align:-2px"')} Flag for Review`;
    }
    const pill = document.getElementById(`qpill-${qId}`);
    if (pill) {
      pill.classList.toggle('flagged', isFlagged);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    renderQuestionStack,
    renderSingleQuestionCard,
    registerCallbacks,
    handleInput,
    handleMRChange,
    handleMatchingChange,
    toggleFlag,
    updateFlagDisplay,
  };
})();

if (typeof window !== 'undefined') {
  window.ESFIMQuestions = ESFIMQuestions;
  window.JCAHQuestions = ESFIMQuestions;
}
if (typeof module !== 'undefined') module.exports = ESFIMQuestions;

