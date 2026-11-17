export async function downloadReport(html, app) {
  if (window.parent !== window) {
    if (!app?.getHostCapabilities()?.downloadFile) throw new Error('Скачивание недоступно в этом окне. Откройте Compare Two Texts в браузере.');
    const result = await app.downloadFile({contents:[{type:'resource',resource:{uri:'file:///comparison.html',mimeType:'text/html',text:html}}]});
    if (result.isError) throw new Error('Не удалось скачать. Попробуйте ещё раз.');
    return;
  }
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='comparison.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
