const express = require('express');
const emailValidator = require('email-validator');
const dns = require('dns');
const AWS = require('aws-sdk'); // Importar AWS SDK para SES
const Imap = require('imap');  // Para leer los rebotes de correo
const inspect = require('util').inspect;

// Crear la aplicación Express
const app = express();
const port = 3000;

// Middleware para parsear JSON en las solicitudes
app.use(express.json());

// Configurar la región de AWS SES
AWS.config.update({
  region: 'us-east-1',  // Cambia esto a la región donde está habilitado SES
});

const ses = new AWS.SES();

// Función para validar el formato del correo electrónico
function validateEmailFormat(email) {
  return emailValidator.validate(email);
}

// Función para validar los registros MX del dominio
function validateMxRecord(domain) {
  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || addresses.length === 0) {
        reject(new Error(`No se encontraron registros MX para el dominio: ${domain}`));
      } else {
        resolve(true);
      }
    });
  });
}

// Función para enviar un correo de prueba utilizando SES
async function sendTestEmail(email) {
  const params = {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: 'Este es un correo de prueba para validar la dirección.',
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Correo de prueba',
      },
    },
    Source: 'moonsethra@gmail.com', // Usa un correo verificado en SES
  };

  try {
    const result = await ses.sendEmail(params).promise();
    console.log('Correo de prueba enviado:', result);
    return true;
  } catch (error) {
    console.error('Error enviando correo de prueba:', error);
    return false;
  }
}

// Función para procesar los rebotes de correo (bounce-back)
function processBounces() {
  const imap = new Imap({
    user: 'moonwayn@gmail.com', // La cuenta de correos para recibir rebotes
    password: 'Moon_13084',     // La contraseña de esa cuenta
    host: 'imap.gmail.com',    // El host IMAP de tu servidor de correo
    port: 993,
    tls: true,
  });

  imap.once('ready', function () {
    imap.openBox('INBOX', true, function (err, box) {
      if (err) throw err;
      const f = imap.seq.fetch('1:*', { bodies: '', struct: true });

      f.on('message', function (msg, seqno) {
        const prefix = '(#' + seqno + ') ';
        msg.on('body', function (stream) {
          let buffer = '';
          stream.on('data', function (chunk) {
            buffer += chunk.toString('utf8');
          });

          stream.once('end', function () {
            console.log(prefix + 'Body: %s', buffer);
            // Aquí puedes verificar si el correo es un "bounce" buscando palabras clave
            if (buffer.includes('Delivery Status Notification') || buffer.includes('mail delivery failed')) {
              console.log('¡Es un rebote!');
              // Aquí puedes procesar el rebote, por ejemplo, marcar la dirección como inválida
            }
          });
        });
      });

      f.once('end', function () {
        console.log('Done fetching all messages!');
        imap.end();
      });
    });
  });

  imap.once('error', function (err) {
    console.log(err);
  });

  imap.once('end', function () {
    console.log('Connection ended');
  });

  imap.connect();
}

// Ruta para validar un correo electrónico
app.post('/validate-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ error: 'El correo electrónico es obligatorio' });
  }

  // Validar el formato del correo electrónico
  if (!validateEmailFormat(email)) {
    return res.status(400).send({ error: 'El formato del correo electrónico es inválido' });
  }

  const domain = email.split('@')[1];

  try {
    // Validar los registros MX del dominio
    await validateMxRecord(domain);
    
    // Verificar si el dominio pertenece a los dominios más populares
    const popularDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
    if (!popularDomains.includes(domain)) {
      return res.status(400).send({ error: 'El dominio del correo no es uno de los más populares.' });
    }
    
    // Enviar correo de prueba y esperar el rebote
    const result = await sendTestEmail(email);

    if (result) {
      res.send({ message: `Correo de prueba enviado a ${email}. Esperando rebote para confirmación.` });
      
      // Procesar los rebotes (esto debería correr en segundo plano o en un intervalo)
      setTimeout(() => {
        processBounces(); // Procesar los correos de rebote en busca de errores
      }, 5000); // Esperamos 5 segundos antes de revisar los rebotes, ajusta según necesidad

    } else {
      res.status(500).send({ error: 'No se pudo enviar el correo de prueba.' });
    }

  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${port}`);
});
