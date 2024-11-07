const express = require('express');
const emailValidator = require('email-validator');
const dns = require('dns');
const AWS = require('aws-sdk');

// Lista de dominios públicos conocidos
const publicDomains = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'
];

// Configuración de Amazon SES
AWS.config.update({ region: 'us-east-1' }); // Ajusta la región a la de tu SES
const ses = new AWS.SES();

// Crear la aplicación Express
const app = express();
const port = 3000;

// Middleware para parsear JSON en las solicitudes
app.use(express.json());

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

// Función para validar si el dominio pertenece a una lista pública conocida
function isPublicDomain(domain) {
  return publicDomains.includes(domain.toLowerCase());
}

// Función para enviar un correo de prueba usando Amazon SES
async function sendTestEmail(email) {
  const params = {
    Source: 'tu_correo_verificado@dominio.com', // Dirección de correo verificada en SES
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Correo de prueba',
      },
      Body: {
        Text: {
          Data: 'Este es un correo de prueba para validar la dirección.',
        },
      },
    },
  };

  try {
    const data = await ses.sendEmail(params).promise();
    console.log('Correo de prueba enviado:', data.MessageId);
    return true;
  } catch (error) {
    console.error('Error enviando correo de prueba:', error);
    return false;
  }
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

  // Validar si el dominio está en la lista de dominios públicos
  if (!isPublicDomain(domain)) {
    return res.status(400).send({ error: 'El dominio no pertenece a una lista de dominios públicos comunes.' });
  }

  try {
    // Validar los registros MX del dominio
    await validateMxRecord(domain);
    
    // Enviar correo de prueba y esperar el rebote
    const result = await sendTestEmail(email);

    if (result) {
      res.send({ message: `Correo de prueba enviado a ${email}. Esperando notificación de rebote de SNS.` });
    } else {
      res.status(500).send({ error: 'No se pudo enviar el correo de prueba.' });
    }

  } catch (error) {
    return res.status(400).send({ error: error.message });
  }
});

// Ruta para recibir notificaciones de rebotes de Amazon SNS
app.post('/sns-bounce', async (req, res) => {
  const messageType = req.headers['x-amz-sns-message-type'];

  if (messageType === 'SubscriptionConfirmation') {
    // Confirma la suscripción a SNS
    const subscribeURL = req.body.SubscribeURL;
    console.log('Confirma la suscripción en:', subscribeURL);
    // Puedes usar fetch o axios para confirmar la suscripción si deseas automatizarlo
  } else if (messageType === 'Notification') {
    const notification = JSON.parse(req.body.Message);

    // Verificar si es un mensaje de rebote
    if (notification.notificationType === 'Bounce') {
      const bouncedRecipients = notification.bounce.bouncedRecipients.map(recipient => recipient.emailAddress);
      console.log('Rebote recibido de:', bouncedRecipients);
      // Aquí puedes marcar las direcciones de correo como inválidas en tu sistema
    }
  }

  res.status(200).end();
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${port}`);
});
