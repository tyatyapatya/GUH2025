import firebase_admin
from firebase_admin import credentials, auth

def initialize_firebase():
    """
    Initializes the Firebase Admin SDK.
    """
    # Note: You need to have the Firebase Admin SDK private key file (serviceAccountKey.json)
    # in your project directory or provide the correct path to it.
    # DO NOT commit this file to your version control.
    try:
        cred = credentials.Certificate('serviceAccountKey.json')
        firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully.")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        print("Please make sure you have the 'serviceAccountKey.json' file in your project root.")
        # In a production environment, you might want to handle this more gracefully.
        # For this hackathon, we'll proceed, but authentication will fail.
        pass

def verify_firebase_token(token):
    """
    Verifies the Firebase ID token.

    Args:
        token (str): The Firebase ID token to verify.

    Returns:
        str: The user's UID if the token is valid, otherwise None.
    """
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        return uid
    except auth.InvalidIdTokenError:
        # Token is invalid
        return None
    except auth.ExpiredIdTokenError:
        # Token has expired
        return None
    except Exception as e:
        print(f"An error occurred during token verification: {e}")
        return None
