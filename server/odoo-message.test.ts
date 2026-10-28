import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOdooInternalNoteBody, isDisplayableOdooMessage, odooHtmlToPlainText } from './odoo-message.js';

test('creates Odoo mention anchors, sends only visible mentions, and escapes user text', () => {
  const note = buildOdooInternalNoteBody(
    'Olá @Davidson Costa. @Davidson Costa <img src=x>',
    [
      { partnerId: 1106, name: 'Davidson Costa' },
      { partnerId: 1107, name: 'Davidson Costa' },
      { partnerId: 1108, name: 'Pessoa removida do texto' }
    ]
  );

  assert.equal(note.partnerIds.join(','), '1106,1107');
  assert.match(note.body, /data-oe-id="1106">@Davidson Costa<\/a>/);
  assert.match(note.body, /data-oe-id="1107">@Davidson Costa<\/a>/);
  assert.match(note.body, /&lt;img src=x&gt;/);
  assert.doesNotMatch(note.body, /data-oe-id="1108"/);
});

test('renders legacy escaped Odoo mention markup as its visible text', () => {
  const body = '&lt;a href=&quot;#&quot; class=&quot;o_mail_redirect&quot; data-oe-model=&quot;res.partner&quot; data-oe-id=&quot;1106&quot;&gt;@Davidson Costa&lt;/a&gt; Anexo M e ART enviado ao cliente.';
  assert.equal(odooHtmlToPlainText(body), '@Davidson Costa Anexo M e ART enviado ao cliente.');
});

test('converts regular Odoo HTML to readable text and removes markup', () => {
  assert.equal(odooHtmlToPlainText('<p>Nota <a href="#">interna</a></p><p>Segunda linha</p>'), 'Nota interna\nSegunda linha');
  assert.equal(odooHtmlToPlainText('<p>Ligação concluída</p><p><br></p><p><br></p><p>Feedback: análise solicitada</p>'), 'Ligação concluída\nFeedback: análise solicitada');
});

test('hides empty Chatter rows but keeps messages that have attachments', () => {
  assert.equal(isDisplayableOdooMessage('', []), false);
  assert.equal(isDisplayableOdooMessage('   ', []), false);
  assert.equal(isDisplayableOdooMessage('', [123]), true);
});
