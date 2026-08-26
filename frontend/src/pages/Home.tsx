import { Seo, siteUrl } from "../components/Seo";
import { CategoriesSection } from "../components/sections/CategoriesSection";
import { FeaturedProducts } from "../components/sections/FeaturedProducts";
import { HeroSection } from "../components/sections/HeroSection";
import { SupportSection } from "../components/sections/SupportSection";
import { TechnologySection } from "../components/sections/TechnologySection";
export function Home(){const structured=[{"@context":"https://schema.org","@type":"Organization","name":"Magno Clean","url":siteUrl,"logo":`${siteUrl}/favicon.svg`},{"@context":"https://schema.org","@type":"WebSite","name":"Magno Clean","url":siteUrl,"potentialAction":{"@type":"SearchAction","target":`${siteUrl}/productos?search={search_term_string}`,"query-input":"required name=search_term_string"}}];return <><Seo title="Magno Clean | Soluciones profesionales de limpieza" description="Productos Magno Clean para limpieza residencial, comercial e industrial, con atención y soporte especializado." path="/" jsonLd={structured}/><HeroSection/><CategoriesSection/><FeaturedProducts/><TechnologySection/><SupportSection/></>}
