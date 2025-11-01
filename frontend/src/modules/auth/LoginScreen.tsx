import { FormEvent, useCallback, useEffect, useState } from 'react';
import styles from '../../styles/LoginScreen.module.css';
import { useAuth, RequestCodeError, VerifyCodeError } from './AuthContext';

type LoginStep = 'request' | 'verify';

type BannerState = { type: 'info' | 'error'; text: string } | null;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const mapRequestError = (error: RequestCodeError) => {
  switch (error) {
    case 'not-found':
      return 'We could not find an account with this email.';
    case 'forbidden':
      return 'Your account is not allowed to sign in yet.';
    case 'mailer-unavailable':
      return 'Email delivery is not configured. Contact your system administrator to set up SMTP.';
    case 'mailer-domain':
      return 'The sender domain is not verified. Confirm DNS records in Resend and try again.';
    case 'mailer-provider':
      return 'Email provider rejected the request. Review your Resend settings and retry.';
    default:
      return 'Unable to send the access code. Try again in a moment.';
  }
};

const mapVerifyError = (error: VerifyCodeError) => {
  switch (error) {
    case 'expired':
      return 'The code has expired. Request a new one to continue.';
    case 'invalid':
      return 'The code is invalid. Check the digits and try again.';
    default:
      return 'Unable to verify the code right now. Try again later.';
  }
};

export const LoginScreen = () => {
  const { requestAccessCode, verifyAccessCode, lastEmail } = useAuth();
  const [step, setStep] = useState<LoginStep>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('email') ?? params.get('invited');
    const initial = normalizeEmail(candidate ?? '') || lastEmail || '';
    if (initial) {
      setEmail(initial);
    }
  }, [lastEmail]);

  const handleRequest = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalized = normalizeEmail(email);
      if (!normalized) {
        setBanner({ type: 'error', text: 'Enter the email that received your invitation.' });
        return;
      }
      setIsRequesting(true);
      const result = await requestAccessCode(normalized);
      setIsRequesting(false);
      if (!result.ok) {
        setBanner({ type: 'error', text: mapRequestError(result.error) });
        return;
      }
      setEmail(result.email);
      setBanner({
        type: 'info',
        text: `We sent a one-time code to ${result.email}. Check your inbox.`
      });
      setCode('');
      setStep('verify');
    },
    [email, requestAccessCode]
  );

  const handleVerify = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedEmail = normalizeEmail(email);
      const trimmedCode = code.trim();
      if (!normalizedEmail) {
        setBanner({ type: 'error', text: 'Enter the email that received your invitation.' });
        return;
      }
      if (!trimmedCode) {
        setBanner({ type: 'error', text: 'Enter the six-digit code from your email.' });
        return;
      }
      setIsVerifying(true);
      const result = await verifyAccessCode(normalizedEmail, trimmedCode, rememberMe);
      setIsVerifying(false);
      if (!result.ok) {
        setBanner({ type: 'error', text: mapVerifyError(result.error) });
        if (result.error !== 'expired') {
          setCode('');
        }
      }
    },
    [email, code, rememberMe, verifyAccessCode]
  );

  const handleResend = useCallback(async () => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setBanner({ type: 'error', text: 'Enter the email that received your invitation.' });
      return;
    }
    setIsRequesting(true);
    const result = await requestAccessCode(normalized);
    setIsRequesting(false);
    if (!result.ok) {
      setBanner({ type: 'error', text: mapRequestError(result.error) });
      return;
    }
    setBanner({ type: 'info', text: `A new code was sent to ${result.email}.` });
  }, [email, requestAccessCode]);

  const handleChangeEmail = useCallback(() => {
    setStep('request');
    setCode('');
    setBanner(null);
    setIsVerifying(false);
  }, []);

  return (
    <section className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.brandMark}>R2</div>
          <div>
            <h1 className={styles.title}>Recruitment 2.0</h1>
            <p className={styles.subtitle}>Secure sign in for invited accounts.</p>
          </div>
        </div>
        <p className={styles.description}>Request a one-time code using the email that received your invitation.</p>

        {banner && (
          <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
        )}

        <form
          className={styles.form}
          onSubmit={step === 'request' ? handleRequest : handleVerify}
          noValidate
        >
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@company.com"
              disabled={step === 'verify'}
            />
          </label>

          {step === 'verify' && (
            <>
              <label className={styles.label}>
                Access code
                <input
                  className={styles.input}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  disabled={isVerifying}
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={isVerifying}
                />
                Keep me signed in on this device
              </label>
            </>
          )}

          <button
            className={styles.primaryButton}
            type="submit"
            disabled={step === 'request' ? isRequesting : isVerifying || isRequesting}
          >
            {step === 'request'
              ? isRequesting
                ? 'Sending...'
                : 'Send access code'
              : isVerifying
                ? 'Signing in...'
                : 'Sign in'}
          </button>
        </form>

        {step === 'verify' && (
          <div className={styles.actionsRow}>
            <button className={styles.linkButton} type="button" onClick={handleResend} disabled={isRequesting}>
              Resend code
            </button>
            <button className={styles.linkButton} type="button" onClick={handleChangeEmail}>
              Use a different email
            </button>
          </div>
        )}

        <p className={styles.helper}>You will receive a six-digit code in the inbox.</p>
      </div>
    </section>
  );
};
