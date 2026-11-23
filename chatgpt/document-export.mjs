const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={replace:'Замена',insert:'Добавление',delete:'Удаление',move:'Перемещение',reflow:'Разбиение строк'};
function report(names,panes,changes,scope='') {
 const rows=changes.map((c,i)=>'<tr><th scope="row">'+(i+1)+'. '+escape(kinds[c.kind]||'Изменение')+'</th><td><pre>'+escape(c.before)+'</pre></td><td><pre>'+escape(c.after)+'</pre></td></tr>').join('');
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Сравнение документов</title><style>body{font:16px system-ui;color:#24372f;margin:32px}h1{font-size:22px}h2{font-size:16px;overflow-wrap:anywhere}small{color:#66756e}.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{min-width:0;border:1px solid #d9dfd8;padding:20px;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.7 Georgia,serif;margin:0 0 12px}mark{background:#fbe0d6;color:inherit}article+article mark{background:#d8efdf}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:24px}th,td{border:1px solid #d9dfd8;padding:12px;vertical-align:top;text-align:left}th:first-child{width:18%}@media print{body{margin:0}article{border:0;padding:8px}mark{print-color-adjust:exact}}</style><h1>Сравнение документов</h1><p><small>Текстовый отчёт · Изменений: '+changes.length+(scope?' · '+escape(scope):'')+'</small></p><div class="columns">'+panes.map((p,i)=>'<article><h2>'+escape(names[i])+'</h2>'+p+'</article>').join('')+'</div><table><thead><tr><th>Изменение</th><th>A</th><th>B</th></tr></thead><tbody>'+rows+'</tbody></table></html>';
}
export function documentReport(snapshot){
 const sides=['original','revised'];
 const panes=sides.map(side=>{
  const records=new Set(snapshot.changes.flatMap(c=>{const b=c[side];return b?(b.source_blocks||[b]).map(p=>p.record):[];}));
  return snapshot.documents[side].blocks.map(b=>'<pre>'+(records.has(b.record)?'<mark>'+escape(b.text)+'</mark>':escape(b.text))+'</pre>').join('');
 });
 const formats=sides.map(s=>snapshot.documents[s].format);
 const scope=[formats.includes('pdf')?'PDF: текстовый слой':'',formats.includes('docx')?'DOCX: основной текст без колонтитулов':''].filter(Boolean).join('; ');
 return report(sides.map(s=>snapshot.documents[s].name),panes,snapshot.changes,scope);
}
export function textReport(comparison){
 const panes=['original','revised'].map(side=>{let cursor=0,body='';for(const c of comparison.changes){body+=escape(comparison[side].slice(cursor,c[side+'Start']))+'<mark>'+escape(comparison[side].slice(c[side+'Start'],c[side+'End']))+'</mark>';cursor=c[side+'End'];}return '<pre>'+body+escape(comparison[side].slice(cursor))+'</pre>';});
 return report([comparison.originalName,comparison.revisedName],panes,comparison.changes);
}
