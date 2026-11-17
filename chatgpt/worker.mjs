import widgetHtml from 'ctt:widget';
import licenses from 'ctt:licenses';
import {createHandler} from './server.mjs';

export default createHandler(widgetHtml,{licenses,onDiagnostic:event=>console.info(JSON.stringify(event))});
