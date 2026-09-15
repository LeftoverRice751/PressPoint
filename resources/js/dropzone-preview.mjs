/*
 * Which preview a dashboard dropzone shows for a picked file.
 *
 * The dropzone (upload-meter.js) renders the chosen file back to the editor
 * before the upload starts: <img> for pictures, a <video>/<audio> player, or
 * a PDF's first page drawn with pdf.js. This is the one decision point, so a
 * new accept= type on some form gets the right renderer by adding it here.
 *
 * DOM-free on purpose — tests/js/dropzone-preview.test.mjs pins it.
 */

var EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
  video: ['mp4', 'm4v', 'webm', 'mov'],
  audio: ['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac'],
  pdf: ['pdf'],
};

function kindFromMime(type) {
  if (!type) return null;
  if (type === 'application/pdf') return 'pdf';
  var family = type.split('/')[0];
  if (family === 'image' || family === 'video' || family === 'audio') return family;
  return null;
}

// Some Linux file pickers hand over File objects with type === '' for
// anything the desktop MIME database does not know, so the name is the
// fallback. The server still verifies by magic bytes; this only picks a
// renderer.
function kindFromName(name) {
  var match = /\.([a-z0-9]+)$/i.exec(name || '');
  if (!match) return null;
  var ext = match[1].toLowerCase();
  var kinds = Object.keys(EXTENSIONS);
  for (var i = 0; i < kinds.length; i++) {
    if (EXTENSIONS[kinds[i]].indexOf(ext) !== -1) return kinds[i];
  }
  return null;
}

export function previewKindFor(file) {
  if (!file) return null;
  return kindFromMime(file.type) || kindFromName(file.name);
}
