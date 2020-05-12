import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as firebase from 'firebase';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import validateFirebaseIdToken from './validator';

admin.initializeApp();

// firebase configuration set via `firebase functions:config:set fconfig.key=`
firebase.initializeApp(functions.config().fconfig.key);

interface Movie {
  title: string;
}

interface Category {
  title: string;
  filter: string;
}

interface UserDetails {
  email: string;
  token: string;
}

const fetchUser = (request: express.Request, response: express.Response) => {

  // retrieve username and password
  const username = request.body.username;
  const password = request.body.password;

  firebase.auth().signInWithEmailAndPassword(username, password).then( (user: firebase.auth.UserCredential) => {
    user.user?.getIdToken(true).then( (token: any) => {
      const userDetails: UserDetails = {
        email: user.user?.email || '',
        token: token
      };
      return response.status(200).json({ user: userDetails })
    }).catch( () => {
      return response.status(400).json({ message: 'Error retrieving user token'});
    })
    
  }).catch( () => {
    response.status(400).json({ message: 'Incorrect user name or password'});
  })
}

const fetchCategories = (request: express.Request, response: express.Response) => {
  const db = admin.firestore();
  db.collection('categories')
    .get()
    .then((snapshot: admin.firestore.QuerySnapshot) => {
      const ret: Category[] = [];
      snapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
        const category: any = doc.data();
        ret.push({
          title: category.title,
          filter: category.filter,
        });
      });
      return response.status(200).json({ data: ret });
    })
    .catch(() => {
      return response.status(400).json({ message: 'Invalid Request' });
    });
};

const fetchMoviesByCategory = (request: express.Request, response: express.Response) => {
  const category = request.query.category;

  const db = admin.firestore();
  const query = category
    ? db.collection('movies').where('categories', 'array-contains', category)
    : db.collection('movies');

  query
    .get()
    .then((snapshot: admin.firestore.QuerySnapshot) => {
      const ret: Movie[] = [];
      snapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
        const movie: any = doc.data();
        ret.push({
          title: movie.title,
        });
      });
      return response.status(200).json({ data: ret });
    })
    .catch(() => {
      return response.status(400).json({ message: 'Invalid Request' });
    });
};

const fetchWatchlist = (request: express.Request, response: express.Response) => {
  // fetch the watchlist according to the logged in user (don't use this as model of security, we're using the admin api here)
  const db = admin.firestore();
  db.collection('userdata').doc(request.userData.uid).collection('watchlist').get().then( (snapshot: admin.firestore.QuerySnapshot) => {
    const ret: Movie[] = [];
      snapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
        const movie: any = doc.data();
        ret.push({
          title: movie.title,
        });
      });
      return response.status(200).json({ data: ret });
  }).catch( () => {
    return response.status(200).json({ data: [] });
  })

}

const main = express();

// common middleware
main.use(bodyParser.urlencoded({ extended: true }));

// endpoints without auth validation
main.get('/categories', fetchCategories);
main.get('/movies', fetchMoviesByCategory);
main.post('/login', fetchUser);

// endpoints requiring auth validation
main.get('/watchlist', validateFirebaseIdToken, fetchWatchlist);

exports.main = functions.https.onRequest(main);