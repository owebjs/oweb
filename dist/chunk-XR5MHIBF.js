import{a as n}from"./chunk-2HA4XQFN.js";var a=n((...t)=>"/"+t.map(e=>e.replace(/^\/|\/$/g,"")).filter(e=>e!=="").join("/"),"mergePaths"),c=/\[([^}]*)\]/g,i=n(t=>c.test(t)?t.replace(c,(e,o)=>`:${o}`):t,"transformBrackets"),m=n(t=>{let e=[];for(let o of t.split("/"))e.push(i(o));return a(...e)},"convertParamSyntax"),h=n(t=>t.replace(/:\.\.\.\w+/g,"*"),"convertCatchallSyntax"),l=n(t=>{let e=t.dir===t.root?"":t.dir,o=t.name.startsWith("index")?t.name.replace("index",""):`/${t.name}`;return e+o},"buildRoutePath"),u=n(t=>{let e="get",o=m(t),r=h(o);for(let s of[".DELETE",".POST",".PATCH",".GET",".PUT"])if(t.endsWith(s)||t.endsWith(s.toLowerCase())){e=s.toLowerCase().slice(1),r=r.slice(0,r.length-s.length);break}return{url:r,method:e}},"buildRouteURL");export{a,m as b,h as c,l as d,u as e};
