import * as admin from 'firebase-admin';
import * as express from 'express';

// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.userData`.
export default async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (
    (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
    !(req.cookies && req.cookies.__session)
  ) {
    console.error(
      'No Firebase ID token was passed as a Bearer token in the Authorization header.',
      'Make sure you authorize your request by providing the following HTTP header:',
      'Authorization: Bearer <Firebase ID Token>',
      'or by passing a "__session" cookie.'
    );
    return res.status(401).send({ message: 'Unauthorized'});
  }

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if (req.cookies) {
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;
  } else {
    // No cookie
    return res.status(401).send({ message: 'Unauthorized'});
  }

  try {
    // retrieve decoded ID token as user info
    const decodedToken = await validateToken(idToken);
    req.userData = decodedToken;
    next();
    return;
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized'});
  }
};

const validateToken = (tokenId: string) => {
  return new Promise<admin.auth.DecodedIdToken>((resolve, reject) => {
    admin
      .auth()
      .verifyIdToken(tokenId)
      .then((decodedToken) => resolve(decodedToken))
      .catch((error) => {
        reject(new Error('401'));
      });
  });
};
