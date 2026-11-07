// What to ask after an event is saved, from the offer the server sent with it.
// Null means don't ask: the open newsletter is in review, or the date has passed.

export function offerDialog(offer, eventTitle) {
  if (!offer) {
    return null;
  }

  var named = '“' + (eventTitle || 'This event') + '”';

  if (offer.full) {
    return {
      kind: 'full',
      title: 'Calendar is full',
      body: named + ' is saved. Issue No. ' + offer.issue_no + ' already has ' +
        offer.capacity + ' dates, so remove one to make room.',
      confirmLabel: 'Manage calendar',
      cancelLabel: 'Close'
    };
  }

  return {
    kind: 'add',
    title: 'Add to your newsletter?',
    body: offer.issue_no
      ? 'Use ' + named + ' in the calendar of Issue No. ' + offer.issue_no + '? It isn’t published yet.'
      : 'Use ' + named + ' in your next newsletter? This starts a new draft.',
    confirmLabel: 'Add to newsletter',
    cancelLabel: 'Not now'
  };
}
