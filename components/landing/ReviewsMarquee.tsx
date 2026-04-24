const REVIEWS: { name: string; text: string }[] = [
  { name: "Priya Ramkhelawan",    text: "Meh daughter was failing Maths CSEC and this thing explain it better than the teacher at school. She PASSING now. Big up the team!! 🔥" },
  { name: "Kezia Charles",        text: "Real talk, iTutor save my SEA prep completely. Couldn't afford private lessons and this app step up like a full-time tutor fr 🙏🏾" },
  { name: "Akeem Joseph",         text: "CAPE Chemistry Unit 1 was killing me. Tried iTutor and actually UNDERSTAND the organic stuff now. Wish I had this in Lower 6 🧪" },
  { name: "Devika Seepersad",     text: "My son get into Naparima!! I cyah believe it. iTutor help him through every past paper for SEA. Thank you from the bottom of meh heart ❤️" },
  { name: "Shondell Phillip",     text: "The way this app break down POB concepts, nah. Even my teacher doh explain it so clear. Grade I looking real possible now 📚" },
  { name: "Tristan Hernandez",    text: "Buss ah marks in Physics CSEC because of this app. Used to score 30%, now scoring 70%+. Not joking, this thing real work ⚡" },
  { name: "Anika Singh",          text: "I is a single mother fuh two children. iTutor cost less than ONE private lesson and available 24/7. Godsend for families like mine 🙌" },
  { name: "Ravi Moonilal",        text: "English A comprehension was my weakness bad bad. iTutor show me HOW to read the passages properly. First time I actually feel confident 📝" },
  { name: "Tamara Baptiste",      text: "Gyul listen, my sister uses this for SEA and I use it for CAPE. Best investment we made this school year. Absolutely recommend 🇹🇹" },
  { name: "Joselle Pierre",       text: "Bio CAPE Unit 2 genetics was impossible until iTutor broke it down step by step. Just got my results — Distinction. I bawl 😭🎉" },
  { name: "Nkosi Williams",       text: "As a teacher I tell ALL my students to use iTutor. It complements classroom learning perfectly. The explanations are top tier fr" },
  { name: "Chandini Ramlal",      text: "My son was dotish with fractions for SEA. iTutor went through it like 10 different ways until he understood. Now he teaching me 😂" },
  { name: "Dexter Cummings",      text: "Maths CSEC paper 2 was my nightmare. Spent two weeks on iTutor doing past papers every night. PASSED with a grade 2. Thank God 🙏" },
  { name: "Renee Marcano",        text: "How yuh mean this app free to try?? The quality of teaching is better than tutors charging $300 an hour. Trinis need to know about this" },
  { name: "Keston Andrews",       text: "Failed CSEC twice. Started using iTutor seriously for third attempt. PASSED. Crying actual tears right now. Don't give up people 💪🏾" },
  { name: "Vandana Persad",       text: "My daughter was getting lorse about Pure Maths CAPE. Three weeks on iTutor and she actually smiling when she study now. Night and day difference ✨" },
  { name: "Sherese Roberts",      text: "Integrated Science was holding back my child whole SEA score. iTutor explain every topic so clearly. She ready now. We confident 🔬" },
  { name: "Omari Thomas",         text: "I use this for Principles of Accounts and honestly the worked examples alone worth everything. POA not scary no more nah 📊" },
  { name: "Chantel Garcia",       text: "Studying for CAPE Communication Studies at 2am and iTutor still there with me. No tutor in TT available at 2am. This thing different 🌙" },
  { name: "Sunita Ramsaran",      text: "My twin boys both using iTutor for CSEC. One doing sciences, one doing business subjects. App handle everything. So proud of them 👨‍👦‍👦" },
  { name: "Marlon Ifill",         text: "Agricultural Science CSEC — try find a tutor for THAT in Trinidad. iTutor saved me completely. Explaining topics I couldn't find anywhere else 🌱" },
  { name: "Geeta Maharaj",        text: "History CSEC essay structure was confusing meh bad. iTutor break down EXACTLY how to structure arguments. Teacher even noticed improvement 📜" },
  { name: "Dane Alexis",          text: "From failing every Chemistry test to actually understanding mol calculations. If I could reach, anybody could reach. iTutor is the real deal 🧬" },
  { name: "Latoya Ferguson",      text: "Not going to lie I was skeptical at first. But my daughter results speak for themselves. SEA prep done different this year 💯" },
  { name: "Krystal Ali",          text: "Technical Drawing was a whole mystery to me. iTutor make it make sense. Finally understand the 3rd angle projection thing properly 📐" },
  { name: "Yemi Olatunji",        text: "Geography CSEC map work had me stressed. iTutor go through every type of question step by step. Real talk this app is a blessing 🗺️" },
  { name: "Simone Fletcher",      text: "My child was crying every night about SEA Maths. We try iTutor last resort. She stopped crying. She PASSING now. Enough said 🌟" },
  { name: "Marcus Boateng",       text: "Spanish CSEC oral practice on iTutor actually helped with pronunciation too. Never thought an app could do that. Impressed fr 🇪🇸" },
  { name: "Indira Chunilal",      text: "Food and Nutrition CSEC, all the nutrients and deficiencies — iTutor made me a chart I could actually remember. Grade I incoming 🥗" },
  { name: "Rhonda Griffith",      text: "As a parent who does work two jobs, I cyah always be home to help with homework. iTutor is like having a tutor at home 24/7. Peace of mind 🏠" },
  { name: "Kwame Samuel",         text: "CAPE Management of Business case studies had me lost. iTutor show me the framework for answering them properly. Game changer 📈" },
  { name: "Reshma Dhanraj",       text: "Leh meh tell you, Social Studies CSEC past papers with iTutor is the best revision method. It explain WHY answers are right or wrong 💡" },
  { name: "Bradley Cox",          text: "Started using this one month before CSEC exams. Not ideal but still made a massive difference. Imagine if I started earlier smh 😅" },
  { name: "Alana Jackman",        text: "My teacher recommend iTutor to the whole class. Now all of us using it together and comparing notes. Making studying fun actually 🤝" },
  { name: "Farouk Mohammed",      text: "Physics mechanics had meh head spinning. iTutor work through problems step by step showing every calculation. Click click click — it clicked 🔭" },
  { name: "Nikeisha Browne",      text: "Doh underestimate this app. It helped my son understand CSEC topics faster than any private teacher we hired before. And cheaper too 💰" },
  { name: "Patrice Birdsong",     text: "CAPE Economics demand and supply analysis — iTutor explain it better than my lecturer at the junior college. I said what I said 📉📈" },
  { name: "Amit Teelucksingh",    text: "Maths paper 1 multiple choice was always tricky for me. iTutor teach me elimination strategies I never knew. Confidence level up 💪" },
  { name: "Chevonne Henry",       text: "My daughter get into Bishops High after using iTutor for SEA prep. If you know how competitive that is, you know how grateful I am 🏆" },
  { name: "Darnell Cudjoe",       text: "Biology CSEC plant systems topic was confusing. iTutor diagrams and step-by-step explanations made it so much clearer. Love this app 🌿" },
  { name: "Sasha Mohammed",       text: "Ohhh gyul meh son pass his SEA because of this app! The teacher wasn't explaining the math properly and I ain't have money fuh private lessons. iTutor save we 🙏🏾" },
  { name: "Keisha Phillip",       text: "Nah fr this app is a blessing. Was failing Maths CSEC and this thing explain it better than the teacher. Actually UNDERSTANDING now. Big up!! 🔥🔥" },
  { name: "Jerome Alexis",        text: "CAPE Applied Maths Statistics had me in tears. Sat with iTutor for one night and suddenly the normal distribution thing make sense. YES BOY 📊" },
  { name: "Natasha Ramoutar",     text: "I'm a Form 6 student and tutor younger students on the side. I recommend iTutor to all my students for extra practice. Real supplement to classes ✅" },
  { name: "Keron Haynes",         text: "English B literature analysis for CAPE was a whole different beast. iTutor help me understand HOW to read texts critically. Grade jumping 📖" },
  { name: "Divya Maharaj",        text: "My child was scoring 40s in SEA Maths. After 6 weeks of iTutor every day she hitting 80s. The improvement real and it real quick too 📈" },
  { name: "Lystra Thomas",        text: "We didn't have money for a private lessons tutor this year. iTutor step in and fill that gap completely. My son ready for CSEC now 🙌" },
  { name: "Omari Thomas",         text: "Chemistry CSEC redox reactions explanation on iTutor is clearer than anything on YouTube. This is what Caribbean students actually need 🔬" },
  { name: "Priya Ramkhelawan",    text: "Second time using iTutor for my younger one after it worked for my first child. Absolute trust in this platform for Caribbean students 💚" },
  { name: "Akeem Joseph",         text: "If you have SEA coming up and you ain't on iTutor yet, wham is wrong with you? Best decision we made this whole school year. Real talk 🇹🇹" },
];

const ROW_1 = REVIEWS.slice(0, 17);
const ROW_2 = REVIEWS.slice(17, 34);
const ROW_3 = REVIEWS.slice(34, 50);

function ReviewCard({ review, idx }: { review: { name: string; text: string }; idx: number }) {
  const seed = encodeURIComponent(review.name + idx);
  return (
    <div className="flex-shrink-0 w-72 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-2">
      <div className="flex items-center gap-3 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.pravatar.cc/80?u=${seed}`}
          alt={review.name}
          width={36}
          height={36}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-200"
        />
        <span className="text-sm font-semibold text-gray-900 truncate">{review.name}</span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{review.text}</p>
    </div>
  );
}

function MarqueeRow({
  reviews,
  direction,
  duration,
}: {
  reviews: { name: string; text: string }[];
  direction: 'left' | 'right';
  duration: string;
}) {
  const doubled = [...reviews, ...reviews];
  const cls = direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right';
  return (
    <div className="marquee-track overflow-hidden">
      <div
        className={`flex ${cls}`}
        style={{ animationDuration: duration, width: 'max-content' }}
      >
        {doubled.map((r, i) => (
          <ReviewCard key={i} review={r} idx={i} />
        ))}
      </div>
    </div>
  );
}

export default function ReviewsMarquee() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden bg-[#f5faf7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
          What Real Students &amp; Parents Are Saying
        </h2>
        <p className="text-gray-500 text-base max-w-xl mx-auto">
          SEA · CSEC · CAPE — real voices, real results from across Trinidad &amp; Tobago
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <MarqueeRow reviews={ROW_1} direction="left"  duration="40s" />
        <MarqueeRow reviews={ROW_2} direction="right" duration="55s" />
        <MarqueeRow reviews={ROW_3} direction="left"  duration="35s" />
      </div>

      {/* Fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#f5faf7]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#f5faf7]" />
    </section>
  );
}
