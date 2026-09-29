(function(){
var d=document,q=location.search;
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
if(d.documentElement.classList.contains('anim')&&'IntersectionObserver' in window){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0,rootMargin:'0px 0px -4% 0px'});
 [].forEach.call(d.querySelectorAll('.rv'),function(el){io.observe(el)});
}
var items=[].slice.call(d.querySelectorAll('[data-mega]'));
function set(li,on){li.classList.toggle('open',on);li.querySelector('button').setAttribute('aria-expanded',on?'true':'false')}
function closeAll(ex){items.forEach(function(li){if(li!==ex)set(li,false)})}
var desk=function(){return window.matchMedia('(min-width:1301px)').matches};
items.forEach(function(li){
 var b=li.querySelector('button');
 b.addEventListener('click',function(e){e.stopPropagation();var on=!li.classList.contains('open');closeAll(li);set(li,on)});
 li.addEventListener('mouseenter',function(){if(desk()){closeAll(li);set(li,true)}});
 li.addEventListener('mouseleave',function(){if(desk())set(li,false)});
});
d.addEventListener('click',function(e){if(!e.target.closest('[data-mega]'))closeAll()});
d.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll()});
var mb=d.getElementById('mb'),mn=d.getElementById('mnav');
if(mb&&mn){mb.addEventListener('click',function(){var on=mn.hidden;mn.hidden=!on;mb.setAttribute('aria-expanded',on?'true':'false')})}
/* table of contents: collapsed on narrow screens, current-section marker */
var toc=d.querySelector('details.toc');
if(toc&&window.matchMedia('(max-width:1100px)').matches)toc.removeAttribute('open');
var links=[].slice.call(d.querySelectorAll('.toc a'));
if(links.length&&'IntersectionObserver' in window){
 var map={};links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a});
 var so=new IntersectionObserver(function(es){es.forEach(function(e){
  if(e.isIntersecting){links.forEach(function(a){a.removeAttribute('aria-current')});var a=map[e.target.id];if(a)a.setAttribute('aria-current','true')}
 })},{rootMargin:'-20% 0px -70% 0px',threshold:0});
 Object.keys(map).forEach(function(id){var el=d.getElementById(id);if(el)so.observe(el)});
}
})();
