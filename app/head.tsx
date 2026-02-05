export default function Head() {
  const fbAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

  return (
    <>
      {fbAppId ? <meta property="fb:app_id" content={fbAppId} /> : null}
    </>
  );
}

