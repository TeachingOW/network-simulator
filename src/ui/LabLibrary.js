import { renderChallengeSolution } from './ChallengeSolutions.js';
import { CHALLENGE_LABS } from './ChallengeLabs.js';
export function renderLabLibrary(root, onLaunch) {
  root.innerHTML=CHALLENGE_LABS.map((lab,index)=>`<article class="lab-card"><div class="lab-meta"><span>CHALLENGE 0${index+1}</span><span>${lab.minutes} min · ${lab.level}</span></div><span class="tag">${lab.topic}</span><h3>${lab.title}</h3><p>${lab.description}</p><details><summary>Mission brief</summary><p>${lab.task}</p></details>${renderChallengeSolution(lab)}${onLaunch?`<button class="btn primary" data-launch-lab="${lab.id}">Start challenge →</button>`:`<a class="btn primary" href="./index.html?lab=${lab.id}">Start challenge →</a>`}</article>`).join('');
  if(onLaunch)root.querySelectorAll('[data-launch-lab]').forEach(button=>button.addEventListener('click',()=>onLaunch(button.dataset.launchLab)));
}
const guideLibrary=document.getElementById('guide-challenges');
if(guideLibrary)renderLabLibrary(guideLibrary);

const tippingPoint=document.getElementById('tipping-point-card');
if(tippingPoint)tippingPoint.insertAdjacentHTML('beforeend',renderChallengeSolution({id:'tipping-point',title:'Find the tipping point'}));
