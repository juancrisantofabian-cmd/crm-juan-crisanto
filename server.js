// server.js — recibe mensajes de WhatsApp (Meta Cloud API) y se los entrega al CRM
// Requiere: npm install express cors
// En Render agrega estas variables de entorno (Environment):
//   VERIFY_TOKEN = el mismo token que pongas en Meta for Developers
//   CRM_API_KEY  = la misma clave que pegas en el CRM
//
// Rutas:
//   GET  /webhook    -> verificación de Meta
//   POST /webhook    -> Meta manda aquí cada mensaje
//   GET  /api/leads  -> el CRM consulta aquí los leads (con ?since=fecha)
//
// OJO: los leads se guardan en memoria. Si Render reinicia el servicio se borran los que
// el CRM no haya descargado. Deja el CRM abierto con "Revisar automáticamente" activado,
// o más adelante conecta una base de datos (Postgres, Firebase, etc.).

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'CAMBIA_ESTO';
const CRM_API_KEY = process.env.CRM_API_KEY || 'CAMBIA_ESTO';
const leads = new Map(); // clave: teléfono

app.get('/', (req, res) => res.send('OK'));

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  try {
    (req.body.entry || []).forEach((entry) => {
      (entry.changes || []).forEach((change) => {
        const value = change.value || {};
        (value.messages || []).forEach((message) => {
          const phone = message.from;
          const contact = (value.contacts || []).find((c) => c.wa_id === phone) || (value.contacts || [])[0];
          const name = contact && contact.profile ? contact.profile.name : '';
          let text = '';
          if (message.text) text = message.text.body;
          else if (message.button) text = message.button.text;
          else if (message.interactive) text = JSON.stringify(message.interactive);
          else text = '[' + message.type + ']';
          const ref = message.referral ? ' (anuncio: ' + (message.referral.headline || message.referral.source_id || '') + ')' : '';
          const now = new Date().toISOString();
          const prev = leads.get(phone);
          leads.set(phone, {
            external_id: 'wa_' + phone,
            name: name || (prev && prev.name) || '',
            phone,
            source: message.referral ? 'Facebook Ads' : 'WhatsApp Business',
            interest: prev ? prev.interest : '',
            notes: text + ref,
            created_at: prev ? prev.created_at : now,
            updated_at: now,
          });
          console.log('Mensaje de', phone, name, text);
        });
      });
    });
  } catch (e) {
    console.error('Error procesando webhook', e);
  }
  res.sendStatus(200);
});

app.get('/api/leads', (req, res) => {
  if (req.get('x-api-key') !== CRM_API_KEY) return res.sendStatus(401);
  const since = req.query.since ? new Date(req.query.since).getTime() : 0;
  const list = [...leads.values()].filter((l) => new Date(l.updated_at).getTime() >= since);
  res.json(list);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor del CRM escuchando en el puerto ' + PORT));
