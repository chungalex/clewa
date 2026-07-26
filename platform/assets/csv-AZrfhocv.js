function r(n){const e=String(n??"");return/[",\n]/.test(e)?`"${e.replace(/"/g,'""')}"`:e}function i(n,e,o){const c=[e.join(","),...o.map(a=>a.map(r).join(","))].join(`
`),s=new Blob([c],{type:"text/csv"}),t=document.createElement("a");t.href=URL.createObjectURL(s),t.download=`${n}-${new Date().toISOString().slice(0,10)}.csv`,t.click(),URL.revokeObjectURL(t.href)}export{i as d};
