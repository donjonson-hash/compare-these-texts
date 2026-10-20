'use strict';
// Open onboarding once; browser/extension updates must leave the user's tabs alone.
const api = typeof browser !== 'undefined' ? browser : chrome;
api.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    api.tabs.create({url: api.runtime.getURL('welcome.html')});
  }
});
