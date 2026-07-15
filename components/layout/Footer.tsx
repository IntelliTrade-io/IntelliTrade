import Link from '@/components/blog/Link'
import siteMetadata from '@/data/blog/siteMetadata'
import SocialIcon from '@/components/blog/social-icons'
// import NewsletterForm from '@/node_modules/pliny/ui/NewsletterForm'
import NewsletterForm from './NewsletterForm'
import { CookiePreferencesLink } from './ConsentBanner'
import { COMPANY, RISK_DISCLAIMER } from '@/lib/company'

export default function Footer() {
  return (
<footer className="z-10 flex flex-col md:flex-row items-center justify-around relative text-white mt-[2vh] bg-white/5 backdrop-blur-sm border-t border-white/10 pb-8 md:py-8">
      {siteMetadata.newsletter?.provider && (
        <div className="flex items-center justify-center">
          {/* <NewsletterForm />
           */}
    <NewsletterForm/>
            

        </div>
      )}
      <div className="mt-16 flex flex-col items-center">
        <div className="mb-3 flex space-x-4">
          <SocialIcon  kind="mail" href={`mailto:${siteMetadata.email}`} size={6} className="emailButton"/>
          {/* <SocialIcon kind="github" href={siteMetadata.github} size={6} /> */}
          {/* <SocialIcon kind="facebook" href={siteMetadata.facebook} size={6} /> */}
          {/* <SocialIcon kind="youtube" href={siteMetadata.youtube} size={6} /> */}
          {/* <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={6} /> */}
          {/* <SocialIcon kind="twitter" href={siteMetadata.twitter} size={6} /> */}
          {/* <SocialIcon kind="bluesky" href={siteMetadata.bluesky} size={6} /> */}
          {/* <SocialIcon kind="x" href={siteMetadata.x} size={6} /> */}
          <SocialIcon kind="instagram" href={siteMetadata.instagram} size={6} className='instagramButton'/>
          <SocialIcon kind="threads" href={siteMetadata.threads} size={6} className='threadsButton'/>
          {/* <SocialIcon kind="medium" href={siteMetadata.medium} size={6} /> */}
        </div>
        <div className="mb-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm text-center px-4">
          <div>{siteMetadata.author}</div>
          <div>{` • `}</div>
          <div>{`© ${new Date().getFullYear()}`}</div>
          <div>{` • `}</div>
          <Link href="/">{siteMetadata.title}</Link>
        </div>
        <div className="mb-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm text-center px-4">
          <Link href="/gold-price-today">Gold price</Link>
          <div>{` • `}</div>
          <Link href="/silver-price-today">Silver price</Link>
          <div>{` • `}</div>
          <Link href="/oil-price-today">Oil price</Link>
          <div>{` • `}</div>
          <Link href="/bitcoin-price-today">Bitcoin price</Link>
        </div>
        <div className="mb-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm text-center px-4">
          <Link href="/privacyStatement">Privacy statement</Link>
          <div>{` • `}</div>
          <Link href="/cookieStatement">Cookie statement</Link>
          <div>{` • `}</div>
          <Link href="/termsOfService">Terms of service</Link>
          <div>{` • `}</div>
          <Link href="/termsOfService#tos-billing">Billing &amp; refunds</Link>
          <div>{` • `}</div>
          <CookiePreferencesLink />
        </div>
        {(COMPANY.legalName || COMPANY.kvk || COMPANY.address) && (
          <div className="mb-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm text-center px-4 text-white/70">
            {COMPANY.legalName && <div>{COMPANY.legalName}</div>}
            {COMPANY.kvk && <div>{`KvK ${COMPANY.kvk}`}</div>}
            {COMPANY.address && <div>{COMPANY.address}</div>}
            <div>{COMPANY.email}</div>
          </div>
        )}
        <p className="mb-8 max-w-3xl px-6 text-center text-xs text-white/50">
          {RISK_DISCLAIMER}
        </p>
      </div>
    </footer>
  )
}
