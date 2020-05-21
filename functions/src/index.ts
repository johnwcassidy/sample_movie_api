import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as firebase from 'firebase';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import validateFirebaseIdToken from './validator';
import { UserRecord } from 'firebase-functions/lib/providers/auth';

admin.initializeApp();

// firebase configuration set via `firebase functions:config:set fconfig.key=`
firebase.initializeApp(functions.config().fconfig.key);

interface Movie {
  id: string;
  title: string;
  description: string;
  image: string;
  video: string;
}

interface Category {
  title: string;
  filter: string;
}

interface UserDetails {
  email: string;
  token: string;
}

interface WatchlistItems {
  [key: string]: WatchlistItem;
}

interface WatchlistEntry {
  id?: string;
  bookmark: number;
  movie_id: string;
}

interface WatchlistItem {
  id?: string;
  bookmark?: number;
  movie?: Movie;
}

const fetchUser = (request: express.Request, response: express.Response) => {
  // retrieve username and password
  const username = request.body.username;
  const password = request.body.password;

  firebase
    .auth()
    .signInWithEmailAndPassword(username, password)
    .then((user: firebase.auth.UserCredential) => {
      user.user
        ?.getIdToken(true)
        .then((token: any) => {
          const userDetails: UserDetails = {
            email: user.user?.email || '',
            token: token,
          };
          return response.status(200).json({ user: userDetails });
        })
        .catch(() => {
          return response.status(400).json({ message: 'Error retrieving user token' });
        });
    })
    .catch(() => {
      response.status(400).json({ message: 'Incorrect user name or password' });
    });
};

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
          id: doc.id,
          title: movie.title,
          description: movie.description,
          image: movie.image,
          video: movie.video,
        });
      });
      return response.status(200).json({ data: ret });
    })
    .catch(() => {
      return response.status(400).json({ message: 'Invalid Request' });
    });
};

const fetchWatchlist = async (request: express.Request, response: express.Response) => {
  // fetch the watchlist according to the logged in user (don't use this as model of security, we're using the admin api here)
  const watchlist = admin.firestore().collection('userdata').doc(request.userData.uid).collection('watchlist');

  // data store for watchlist items to be resolved later on
  const watchListRet: WatchlistItems = {};

  const movieIds: string[] = [];
  const snapshot: admin.firestore.QuerySnapshot = await watchlist.get();
  snapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
    const watchlistItem: any = doc.data();

    const watchlistId: string = doc.id;
    const movieId: string = watchlistItem.movie_id.trim();

    watchListRet[movieId] = {
      id: watchlistId,
      bookmark: watchlistItem.bookmark,
    };

    movieIds.push(movieId);
  });

  // handle empty data set
  if (movieIds.length === 0) {
    return response.status(200).json({ data: [] });
  }

  // fetch movies matching watchlist
  const movies = admin.firestore().collection('movies').where(admin.firestore.FieldPath.documentId(), 'in', movieIds);
  const moviesSnapshot: admin.firestore.QuerySnapshot = await movies.get();

  const ret: WatchlistItem[] = [];
  moviesSnapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
    const movie: any = doc.data();
    const movieId: string = doc.id;

    // resolve watchlist items to movie
    watchListRet[movieId].movie = {
      id: movieId,
      title: movie.title,
      description: movie.description,
      image: movie.image,
      video: movie.video,
    };

    ret.push(watchListRet[movieId]);
  });

  return response.status(200).json({ data: ret });
};

const addWatchlistItem = async (request: express.Request, response: express.Response) => {
  // validate parameters
  if (!request.body.bookmark) {
    return response.status(400).json({ message: 'Bookmark required' });
  }

  if (!request.body.movie_id || request.body.movie_id.trim().length === 0) {
    return response.status(400).json({ message: 'movie_id required' });
  }

  const watchlist: WatchlistEntry = {
    bookmark: request.body.bookmark,
    movie_id: request.body.movie_id,
  };

  const watchlistCol = admin.firestore().collection('userdata').doc(request.userData.uid).collection('watchlist');
  await watchlistCol.add(watchlist);

  return response.status(200).json({ message: 'Watchlist item added' });
};

const deleteWatchlistItem = async (request: express.Request, response: express.Response) => {
  if (!request.params.id || request.params.id.trim().length === 0) {
    return response.status(400).json({ message: 'movie_id required' });
  }

  const watchlistDoc = admin
    .firestore()
    .collection('userdata')
    .doc(request.userData.uid)
    .collection('watchlist')
    .doc(request.params.id);
  await watchlistDoc.delete();

  return response.status(200).json({ message: 'Watchlist item deleted' });
};

const updateWatchistItem = async (request: express.Request, response: express.Response) => {
  // validate parameters
  if (!request.body.bookmark) {
    return response.status(400).json({ message: 'Bookmark required' });
  }

  if (!request.body.movie_id || request.body.movie_id.trim().length === 0) {
    return response.status(400).json({ message: 'movie_id required' });
  }

  const watchlistDoc = admin
    .firestore()
    .collection('userdata')
    .doc(request.userData.uid)
    .collection('watchlist')
    .doc(request.body.movie_id);
  await watchlistDoc.update({
    bookmark: request.body.bookmark,
  });

  return response.status(200).json({ message: 'Watchlist item updated' });
};

const main = express();

// common middleware
main.use(bodyParser.urlencoded({ extended: true }));

// endpoints without auth validation
main.get('/categories', fetchCategories);
main.get('/movies', fetchMoviesByCategory);
main.post('/login', fetchUser);

// endpoints requiring auth validation
main.get('/watchlist', validateFirebaseIdToken, fetchWatchlist);
main.post('/watchlist', validateFirebaseIdToken, addWatchlistItem);
main.patch('/watchlist', validateFirebaseIdToken, updateWatchistItem);
main.delete('/watchlist/:id', validateFirebaseIdToken, deleteWatchlistItem);

exports.main = functions.https.onRequest(main);

// Cloud function to detect new users and add some sample watchlist data
exports.addMockWatchlistData = functions.auth.user().onCreate(async (user: UserRecord) => {
  try {
    const movieSnapshot: admin.firestore.QuerySnapshot = await admin.firestore().collection('movies').limit(2).get();
    let movieIds: string[] = [];
    movieSnapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
      movieIds.push(doc.id);
    });

    const watchlistRef = admin.firestore().collection('userdata').doc(user.uid).collection('watchlist');
    let batch = admin.firestore().batch();
    movieIds.forEach((movieId: string) => {
      batch.set(watchlistRef.doc(), {
        bookmark: 1500,
        movie_id: movieId,
      });
    });
    await batch.commit();
  } catch (error) {
    console.log('Error adding mock data');
  }
});

exports.deleteUserData = functions.auth.user().onDelete(async (user: UserRecord) => {
  try {
    const userDataRef = admin.firestore().collection('userdata').doc(user.uid);
    const userWatchlistCol = userDataRef.collection('watchlist');

    // retrieve all documents of the watchlist collection to delete
    let batch = admin.firestore().batch();
    const watchlistSnapshot: admin.firestore.QuerySnapshot = await userWatchlistCol.get();
    watchlistSnapshot.forEach((doc: admin.firestore.DocumentSnapshot) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    await userDataRef.delete();
  } catch (error) {
    console.log('Error deleting mock data');
  }
});
