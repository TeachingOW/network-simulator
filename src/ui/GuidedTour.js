import { revealTabFor } from './Tabs.js';
import { TOUR_STEPS, tourStepComplete } from './TourPlan.js';

// Accessible, non-modal in-app teaching overlay. The user interacts with the actual
// editor; every checked step observes the real simulator/model, not a scripted fake.
export function createGuidedTour({
  button, getState, beginPractice, restorePrevious, pause, focusLink, announce = () => {}
}) {
  if (!button) throw new Error('Guided tour start button is required');
  if (![getState,beginPractice,restorePrevious,pause,focusLink].every(x=>typeof x==='function'))
    throw new TypeError('Guided tour requires editor integration callbacks');

  const panel = document.createElement('section');
  panel.id = 'tour-panel';
  panel.className = 'tour-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'tour-title');
  panel.setAttribute('aria-describedby', 'tour-instruction');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="tour-top">
      <div><span class="tour-kicker">LEARN BY DOING</span><h2 id="tour-title" tabindex="-1"></h2></div>
      <button id="tour-exit" class="tour-icon-close" type="button" aria-label="Exit tour and restore previous network" title="Exit tour and restore previous network">✕</button>
    </div>
    <div class="tour-progressline"><span id="tour-count"></span>
      <div id="tour-progress" class="tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin="0" aria-valuemax="${TOUR_STEPS.length}"><span id="tour-bar"></span></div>
    </div>
    <p id="tour-instruction" class="tour-instruction"></p>
    <div class="tour-task"><strong>Your task</strong><p id="tour-task-text"></p></div>
    <p id="tour-feedback" class="tour-feedback" aria-live="polite"></p>
    <div class="tour-actions">
      <button type="button" class="btn" id="tour-back">Previous</button>
      <button type="button" class="btn" id="tour-skip">Skip step</button>
      <button type="button" class="btn primary" id="tour-next">Next</button>
    </div>
    <p class="tour-footnote">Exit (✕ or Esc) restores your previous network. Finish keeps the practice network.</p>
  `;
  document.body.appendChild(panel);
  const $ = id => panel.querySelector('#'+id);
  const title=$('tour-title'),counter=$('tour-count'),progress=$('tour-progress'),
    bar=$('tour-bar'),instruction=$('tour-instruction'),taskText=$('tour-task-text'),
    feedback=$('tour-feedback'),back=$('tour-back'),skip=$('tour-skip'),next=$('tour-next');

  let index=-1, saved=null, enteredRouteVersion=0;
  let highlighted=null, lastComplete=null;

  function getStep() { return index < 0 ? null : TOUR_STEPS[index]; }
  function isActive() { return index >= 0; }
  function clearHighlight() {
    if (highlighted) highlighted.classList.remove('tour-target');
    highlighted=null;
  }
  function highlightCurrent({scroll=false}={}) {
    const step=getStep();
    if(!step)return;
    const el=document.querySelector(step.target);
    if(!el){
      clearHighlight();
      return;
    }
    if(el.closest('[hidden]'))revealTabFor(el);
    if(el!==highlighted){
      clearHighlight();highlighted=el;el.classList.add('tour-target');
    }
    // Keep the tutorial card away from the target on wide screens.
    // The highlighted control itself must remain clickable.
    const r=el.getBoundingClientRect();
    if(window.innerWidth>750 && r.left>window.innerWidth*.5){
      panel.style.left='18px';
      panel.style.right='auto';
    } else {
      panel.style.left='auto';
      panel.style.right=window.innerWidth<=600?'8px':'18px';
    }
    if(scroll && typeof el.scrollIntoView==='function')
      el.scrollIntoView({behavior:'smooth',block:window.innerWidth<=750?'start':'center',inline:'nearest'});
  }
  function refresh() {
    const step=getStep();
    if(!step)return false;
    const done=tourStepComplete(step,{...getState(),enteredRouteVersion});
    if(done!==lastComplete) {
      feedback.textContent=done
        ? (step.id==='limitations' ? 'You have completed the guided lab.' : '✓ Task complete. You can continue.')
        : 'Complete the task in the simulator, or choose Skip step.';
      feedback.classList.toggle('tour-ready',done);
      next.disabled=!done;
      lastComplete=done;
    }
    highlightCurrent();
    return done;
  }
  function enter(nextIndex) {
    clearHighlight();
    index=nextIndex;
    const step=getStep();
    if(!step)return;
    // Pausing does not alter the packet trace. The simulation stays available
    // to inspect while the next step is explained.
    if(['congestion','tcp-preset','limitations'].includes(step.id))pause();
    if(step.id==='congestion')focusLink('r2','s2');
    enteredRouteVersion=getState().routeVersion;
    title.textContent=step.title;
    counter.textContent=`Step ${index+1} of ${TOUR_STEPS.length}`;
    instruction.textContent=step.instruction;
    taskText.textContent=step.task;
    progress.setAttribute('aria-valuenow',String(index+1));
    bar.style.width=`${100*(index+1)/TOUR_STEPS.length}%`;
    back.disabled=index===0;
    skip.hidden=index===TOUR_STEPS.length-1;
    next.textContent=index===TOUR_STEPS.length-1?'Finish & keep lab':'Next';
    lastComplete=null;
    refresh();
    highlightCurrent({scroll:true});
    title.focus({preventScroll:true});
  }
  function start() {
    if(isActive()){title.focus();return;}
    saved=beginPractice();
    panel.hidden=false;
    button.setAttribute('aria-expanded','true');
    button.classList.add('active');
    enter(0);
  }
  function finish() {
    if(!isActive())return;
    // Finishing explicitly retains the practice topology.
    saved=null;index=-1;panel.hidden=true;clearHighlight();
    button.setAttribute('aria-expanded','false');
    button.classList.remove('active');
    announce('Guided tour complete. Practice network kept.');
    button.focus();
  }
  function exit() {
    if(!isActive())return;
    const original=saved;
    saved=null;index=-1;panel.hidden=true;clearHighlight();
    button.setAttribute('aria-expanded','false');
    button.classList.remove('active');
    if(original)restorePrevious(original);
    announce('Guided tour closed. Your earlier network was restored.');
    button.focus();
  }
  function nextStep({skip=false}={}) {
    if(!isActive())return;
    if(!skip&&!refresh())return;
    if(index===TOUR_STEPS.length-1){finish();return;}
    enter(index+1);
  }

  button.setAttribute('aria-controls',panel.id);
  button.setAttribute('aria-expanded','false');
  button.addEventListener('click',start);
  next.addEventListener('click',()=>nextStep());
  skip.addEventListener('click',()=>nextStep({skip:true}));
  back.addEventListener('click',()=>{if(index>0)enter(index-1)});
  $('tour-exit').addEventListener('click',exit);
  document.addEventListener('keydown',event=>{
    if(!isActive()||event.key!=='Escape')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exit();
  },true);
  return {start,exit,finish,refresh,isActive,getStep,get stepCount(){return TOUR_STEPS.length;}};
}
