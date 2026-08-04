import { useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Unsubscribe from auth state observer when unmounting
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        try {
          const emailKey = currentUser.email.toLowerCase();
          
          // Offline Fallback
          if (!navigator.onLine) {
            const cachedRole = localStorage.getItem(`auth_role_${emailKey}`);
            if (cachedRole) {
              setRole(cachedRole);
              setUser({ ...currentUser, role: cachedRole });
            } else {
              setRole('none');
              setUser({ ...currentUser, role: 'none' });
            }
            setLoading(false);
            return;
          }

          const userDocRef = doc(db, 'users', emailKey);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            // User exists and has a role
            const userData = userDocSnap.data();
            setRole(userData.role);
            localStorage.setItem(`auth_role_${emailKey}`, userData.role);

            // Update latest user info (fire and forget to not block auth)
            setDoc(userDocRef, {
              ...userData,
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              lastLogin: new Date().toISOString()
            }, { merge: true }).catch(console.error);
            
            setUser({ ...currentUser, role: userData.role });
          } else {
            // Access is deny-by-default. A super-admin record must be seeded
            // during setup, then additional users are managed in the app.
            setRole('none');
            localStorage.removeItem(`auth_role_${emailKey}`);
            setUser({ ...currentUser, role: 'none' });
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('none');
          setUser(currentUser);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
      throw error;
    }
  };

  return { user, role, loading, signInWithGoogle, signOut };
}
