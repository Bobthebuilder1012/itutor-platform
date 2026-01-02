# iTutor Landing Page

A modern, dark-mode marketing landing page for iTutor built with Next.js and Tailwind CSS.

## ✅ Implementation Complete

All components and styling have been successfully implemented according to specifications.

## 🎨 Brand Colors

The following brand colors have been configured in `tailwind.config.ts`:

- **Black**: `#000000` - Primary background
- **Green**: `#199358` - Accent and CTAs
- **White**: `#F4F4F4` - Primary text
- **Card**: `#0F0F0F` - Card backgrounds
- **Border**: `#1C1C1C` - Subtle borders
- **Muted**: `#BDBDBD` - Secondary text

## 📁 Required: Logo Files

Please add your iTutor logo files to the following directory:

```
public/assets/logo/
└── itutor-logo-light.png   (currently in use)
```

**Important**: The page is currently using these paths. Make sure to add the actual logo files to avoid broken images.

## 🚀 Running the Application

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Page Structure

The landing page consists of 10 sections in the following order:

1. **Header** - Sticky navigation with logo and CTAs
2. **Hero** - Main headline with CTAs and gradient effects
3. **Featured Carousel** - Horizontal scroll carousel of tutors/subjects
4. **Subject Pills** - Filter buttons for different subjects
5. **Features Checklist** - Key features with icons (light section)
6. **Motivation Section** - Aspirational messaging
7. **Support Blocks** - Two support-focused cards
8. **FAQ Accordion** - Expandable frequently asked questions
9. **Credibility Strip** - Trust indicators
10. **Footer** - Links, social media, and copyright

## 🔗 CTA Routes

All call-to-action buttons link to the following routes (no modals or auth logic):

- `/signup` - Primary CTAs and "Get Started"
- `/login` - Login button
- `/about`, `/contact`, `/privacy`, `/terms` - Footer links

## 🎯 Features

- ✅ Dark mode dominant design
- ✅ Fully responsive (mobile-first)
- ✅ Smooth scrolling
- ✅ No authentication logic (links only)
- ✅ Accessible color contrast
- ✅ Clean component structure
- ✅ Semantic HTML
- ✅ Subtle hover states

## 📱 Components

All landing page components are located in `components/landing/`:

- `Header.tsx` - Navigation with scroll effect
- `Hero.tsx` - Hero section with decorative gradients
- `FeaturedCarousel.tsx` - Tutor/subject carousel
- `SubjectPills.tsx` - Subject filter pills
- `FeaturesChecklist.tsx` - Features with icons
- `MotivationSection.tsx` - Motivational content
- `SupportBlocks.tsx` - Support messaging
- `FAQAccordion.tsx` - Collapsible FAQ
- `CredibilityStrip.tsx` - Trust indicators
- `Footer.tsx` - Footer with links and social

## 🎨 Styling

- Configured in `tailwind.config.ts` with custom iTutor brand colors
- Global styles in `app/globals.css` with smooth scrolling
- Mobile-first responsive breakpoints
- Consistent spacing and typography

## 📝 Notes

- This is a **static marketing page only**
- No Supabase integration
- No authentication logic
- No pricing or payment logic
- All CTAs are simple Next.js Link components

## 🔄 Next Steps

1. Add logo files to `public/assets/logo/`
2. Test the page locally
3. Customize content as needed
4. Deploy when ready

