// Tab groups use roving focus and support Arrow, Home, and End keys.
export function activateTab(panelId, {focus=false}={}) {
  const panel=document.getElementById(panelId);
  const tab=document.querySelector(`[role="tab"][aria-controls="${panelId}"]`);
  if(!tab || !panel)return;
  const list=tab.closest('[role="tablist"]');
  for(const sibling of list.querySelectorAll('[role="tab"]')) {
    const active=sibling===tab;
    sibling.setAttribute('aria-selected',String(active));
    sibling.tabIndex=active?0:-1;
    document.getElementById(sibling.getAttribute('aria-controls')).hidden=!active;
  }
  if(focus)tab.focus();
}
export function revealTabFor(element) {
  if(!element)return;
  const panels=[];
  for(let parent=element;parent;parent=parent.parentElement)
    if(parent.getAttribute('role')==='tabpanel')panels.unshift(parent);
  panels.forEach(panel=>activateTab(panel.id));
}
export function initializeTabs() {
  for(const list of document.querySelectorAll('[role="tablist"]')) {
    const tabs=[...list.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>activateTab(tab.getAttribute('aria-controls')));
      tab.addEventListener('keydown',event=>{
        let next;
        if(event.key==='ArrowRight')next=(index+1)%tabs.length;
        if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
        if(event.key==='Home')next=0;
        if(event.key==='End')next=tabs.length-1;
        if(next===undefined)return;
        event.preventDefault();activateTab(tabs[next].getAttribute('aria-controls'),{focus:true});
      });
    });
  }
}
