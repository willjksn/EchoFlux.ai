import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { VIDEO_MINUTE_PACKS } from '../constants.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const useTestMode = process.env.STRIPE_USE_TEST_MODE === 'true' || process.env.STRIPE_USE_TEST_MODE === '1';
const stripeSecretKey = useTestMode
  ? (process.env.STRIPE_SECRET_KEY_Test || process.env.STRIPE_SECRET_KEY)
  : (process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY);

if (!stripeSecretKey) {
  throw new Error('Stripe secret key not configured');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20' as any,
});

async function verifyToken(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await verifyToken(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { packId } = req.body;
  
  const pack = VIDEO_MINUTE_PACKS.find(p => p.id === packId);
  if (!pack) {
    return res.status(400).json({ error: 'Invalid pack ID' });
  }

  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const email = userData?.email || '';

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://echoflux.ai';
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Video Chat Minutes - ${pack.label}`,
              description: `${pack.minutes} video chat minutes for your fan page`,
            },
            unit_amount: pack.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'video_minutes',
        userId,
        packId: pack.id,
        minutes: pack.minutes.toString(),
      },
      success_url: `${baseUrl}/settings?tab=billing&video_minutes_purchased=true`,
      cancel_url: `${baseUrl}/settings?tab=billing&video_minutes_cancelled=true`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
