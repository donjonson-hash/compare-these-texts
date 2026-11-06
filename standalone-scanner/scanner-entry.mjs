import {mountScanner} from './scanner-app.mjs';
void mountScanner().catch(error => {
  const node=document.getElementById('scanner-notice');node.textContent=`Could not start Document Scanner: ${error.message}`;node.hidden=false;node.classList.add('error');
});
