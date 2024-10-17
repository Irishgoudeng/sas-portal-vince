import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, query, where, collection, getDocs } from 'firebase/firestore';
import { app } from '../../firebase'; 
import jwt from 'jsonwebtoken';
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const db = getFirestore(app);
const auth = getAuth(app);

// Fetch Firestore data by email to get workerId and user details
async function fetchUserDataByEmail(email) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', email)); // Query Firestore by email
  
  try {
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      throw new Error('User not found in Firestore');
    }
    
    // We expect only one user with this email
    const userData = querySnapshot.docs[0].data();
    return userData;
  } catch (error) {
    throw new Error(`Error fetching user data: ${error.message}`);
  }
}

export default async function handler(req, res) {
  const { email, password } = req.body; // Removed workerId from the request

  // Ensure it's a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Step 1: Sign in with Firebase Authentication using email and password
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Step 2: Fetch user data from Firestore using the email
    const userData = await fetchUserDataByEmail(email);

    // Step 3: Check if the uid from Firebase matches the Firestore uid
    if (user.uid !== userData.uid) {
      return res.status(403).json({ message: 'UID does not match the user data in Firestore.' });
    }

    // Step 4: Check if the user is an admin
    if (!userData.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admins only.' });
    }

    // Step 5: SAP B1 Service Layer Authentication
    const sapLoginResponse = await fetch(`${process.env.SAP_SERVICE_LAYER_BASE_URL}Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CompanyDB: process.env.SAP_B1_COMPANY_DB,
        UserName: process.env.SAP_B1_USERNAME,
        Password: process.env.SAP_B1_PASSWORD,
      }),
      agent: new https.Agent({ rejectUnauthorized: false }),
    });

    if (!sapLoginResponse.ok) {
      throw new Error('SAP B1 Service Layer login failed');
    }

    const sapLoginData = await sapLoginResponse.json();
    const sessionId = sapLoginData.SessionId;

    // Set session cookies securely
    res.setHeader('Set-Cookie', [
      `B1SESSION=${sessionId}; HttpOnly; Secure; SameSite=None`,
    ]);

    // Step 6: Generate JWT token
    const token = { uid: user.uid, isAdmin: userData.isAdmin };
    const secretKey = process.env.JWT_SECRET_KEY || 'kdaJLPhRtGKGTLiAThdvHnVR0H544DOGM3Q2OBerQk4L0z1zzcaOVqU0afHK6ab';  // Use your secret key here
    const customToken = jwt.sign(token, secretKey, { expiresIn: '30m' });

    // Step 7: Respond with user data and token
    return res.status(200).json({
      message: 'Login successful',
      uid: user.uid,
      email: user.email,
      workerId: userData.workerID, 
      fullName: userData.fullName,
      isAdmin: userData.isAdmin,
      customToken,
      sessionId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}


// import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// import { getFirestore, doc, getDoc } from 'firebase/firestore';
// import { app } from '../../firebase'; 
// import jwt from 'jsonwebtoken';
// import https from 'https';

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// const db = getFirestore(app);
// const auth = getAuth(app);

// // Fetch Firestore data by workerId
// async function fetchUserDataByDocumentID(documentID) {
//   const userDocRef = doc(db, 'users', documentID); 
//   try {
//     const userDocSnapshot = await getDoc(userDocRef);
//     if (userDocSnapshot.exists()) {
//       return userDocSnapshot.data();
//     } else {
//       throw new Error('User not found in Firestore');
//     }
//   } catch (error) {
//     throw new Error(`Error fetching user data: ${error.message}`);
//   }
// }

// export default async function handler(req, res) {
//   const { email, password, workerId } = req.body;

//   // Ensure it's a POST request
//   if (req.method !== 'POST') {
//     return res.status(405).json({ message: 'Method Not Allowed' });
//   }

//   try {
//     // Step 1: Sign in with Firebase Authentication using email and password
//     const userCredential = await signInWithEmailAndPassword(auth, email, password);
//     const user = userCredential.user;

//     // Step 2: Fetch user data from Firestore by workerId (documentID)
//     const userData = await fetchUserDataByDocumentID(workerId);

//     // Step 3: Check if the email and uid from Firebase match the Firestore data
//     if (user.email !== userData.email || user.uid !== userData.uid) {
//       return res.status(403).json({ message: 'Email or UID does not match the user data in Firestore.' });
//     }

//     // Step 4: Check if the user is an admin
//     if (!userData.isAdmin) {
//       return res.status(403).json({ message: 'Access denied. Admins only.' });
//     }

//     // Step 5: SAP B1 Service Layer Authentication
//     const sapLoginResponse = await fetch(`${process.env.SAP_SERVICE_LAYER_BASE_URL}Login`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         CompanyDB: process.env.SAP_B1_COMPANY_DB,
//         UserName: process.env.SAP_B1_USERNAME,
//         Password: process.env.SAP_B1_PASSWORD,
//       }),
//       agent: new https.Agent({ rejectUnauthorized: false }),
//     });

//     if (!sapLoginResponse.ok) {
//       throw new Error('SAP B1 Service Layer login failed');
//     }

//     const sapLoginData = await sapLoginResponse.json();
//     const sessionId = sapLoginData.SessionId;

//     // Set session cookies securely
//     res.setHeader('Set-Cookie', [
//       `B1SESSION=${sessionId}; HttpOnly; Secure; SameSite=None`,
//     ]);

//     // Step 6: Generate JWT token
//     const token = { uid: user.uid, isAdmin: userData.isAdmin };
//     const secretKey = 'kdaJLPhRtGKGTLiAThdvHnVR0H544DOGM3Q2OBerQk4L0z1zzcaOVqU0afHK6ab';  // Use your secret key here
//     const customToken = jwt.sign(token, secretKey, { expiresIn: '30m' });

//     // Step 7: Respond with user data and token
//     return res.status(200).json({
//       message: 'Login successful',
//       uid: user.uid,
//       email: user.email,
//       workerId: userData.workerId,
//       fullName: userData.fullName,
//       isAdmin: userData.isAdmin,
//       customToken,
//       sessionId,
//     });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// }


// // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// // import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
// // import { getFirestore, doc, getDoc } from 'firebase/firestore';
// // import { app } from '../../firebase'; 
// // import jwt from 'jsonwebtoken';
// // import https from 'https';

// // const db = getFirestore(app);
// // const auth = getAuth(app);

// // async function fetchUserDataByDocumentID(documentID) {
// //   const userDocRef = doc(db, 'users', documentID); 
// //   try {
// //     const userDocSnapshot = await getDoc(userDocRef);
// //     if (userDocSnapshot.exists()) {
// //       return userDocSnapshot.data();
// //     } else {
// //       throw new Error('User not found in Firestore');
// //     }
// //   } catch (error) {
// //     throw new Error(`Error fetching user data: ${error.message}`);
// //   }
// // }


// // export default async function handler(req, res) {
// //   const { email, password, workerId } = req.body;

// //   if (req.method !== 'POST') {
// //     return res.status(405).json({ message: 'Method Not Allowed' });
// //   }

// //   try {
// //     const userCredential = await signInWithEmailAndPassword(auth, email, password);
// //     const user = userCredential.user;

// //     // Fetch Firestore data
// //     const userData = await fetchUserDataByDocumentID(workerId);

// //     if (!userData.isAdmin) {
// //       return res.status(403).json({ message: 'Access denied. Admins only.' });
// //     }

// //     // Trigger SAP B1 Service Layer Authentication
// //     const sapLoginResponse = await fetch(`${process.env.SAP_SERVICE_LAYER_BASE_URL}Login`, {
// //       method: 'POST',
// //       headers: { 'Content-Type': 'application/json' },
// //       body: JSON.stringify({
// //         CompanyDB: process.env.SAP_B1_COMPANY_DB,
// //         UserName: process.env.SAP_B1_USERNAME,
// //         Password: process.env.SAP_B1_PASSWORD,
// //       }),
// //       agent: new https.Agent({ rejectUnauthorized: false }),
// //     });

// //     if (!sapLoginResponse.ok) {
// //       throw new Error('SAP B1 Service Layer login failed');
// //     }

// //     const sapLoginData = await sapLoginResponse.json();
// //     const sessionId = sapLoginData.SessionId;

// //     // Set session cookies securely
// //     res.setHeader('Set-Cookie', [
// //       `B1SESSION=${sessionId}; HttpOnly; Secure; SameSite=None`,
// //     ]);

// //     // Generate JWT token
// //     const token = { uid: user.uid, isAdmin: userData.isAdmin };
// //     const secretKey = 'kdaJLPhRtGKGTLiAThdvHnVR0H544DOGM3Q2OBerQk4L0z1zzcaOVqU0afHK6ab';
// //     const customToken = jwt.sign(token, secretKey, { expiresIn: '30m' });

// //     return res.status(200).json({
// //       message: 'Login successful',
// //       uid: user.uid,
// //       email: user.email,
// //       workerId: userData.workerId,
// //       fullName: userData.fullName,
// //       isAdmin: userData.isAdmin,
// //       customToken,
// //       sessionId,
// //     });
// //   } catch (error) {
// //     return res.status(500).json({ message: error.message });
// //   }
// // }
