import { Seo } from "../components/Seo";
type Kind = "privacy" | "terms" | "returns";
const content = {
  privacy: {
    title: "Aviso de privacidad",
    description: "Estructura del aviso de privacidad de Magno Clean.",
    intro:
      "Este documento está pendiente de revisión legal y de incorporar los datos definitivos del responsable del tratamiento.",
    sections: [
      [
        "Información que puede recopilarse",
        "Datos de contacto, entrega y compra proporcionados durante una solicitud o pedido.",
      ],
      [
        "Finalidades",
        "Procesar compras, coordinar entregas, brindar soporte y cumplir obligaciones aplicables.",
      ],
      [
        "Derechos y contacto",
        "El procedimiento y canal definitivo para ejercer derechos se publicará tras la revisión legal.",
      ],
    ],
  },
  terms: {
    title: "Términos y condiciones",
    description:
      "Estructura de términos y condiciones de compra de Magno Clean.",
    intro:
      "Contenido base pendiente de validación legal antes del lanzamiento comercial definitivo.",
    sections: [
      [
        "Uso del sitio",
        "El catálogo permite consultar productos y realizar solicitudes de compra sujetas a disponibilidad.",
      ],
      [
        "Precios y pagos",
        "Los precios vigentes se muestran en el producto y los pagos se procesan mediante el proveedor indicado en checkout.",
      ],
      [
        "Información empresarial",
        "Razón social, domicilio y jurisdicción deberán incorporarse después de su confirmación.",
      ],
    ],
  },
  returns: {
    title: "Cambios y devoluciones",
    description:
      "Estructura informativa de cambios y devoluciones de Magno Clean.",
    intro:
      "La política definitiva, plazos y condiciones están pendientes de revisión y aprobación legal.",
    sections: [
      [
        "Solicitud",
        "Conserva tu número de orden y la evidencia del estado del producto para solicitar atención.",
      ],
      [
        "Evaluación",
        "Cada solicitud deberá revisarse considerando el producto, su condición y la normatividad aplicable.",
      ],
      [
        "Excepciones y plazos",
        "No se publican plazos ni excepciones hasta contar con una política legalmente validada.",
      ],
    ],
  },
};
export function LegalPage({ kind }: { kind: Kind }) {
  const page = content[kind];
  const path =
    kind === "privacy"
      ? "/privacidad"
      : kind === "terms"
        ? "/terminos"
        : "/devoluciones";
  return (
    <>
      <Seo title={page.title} description={page.description} path={path} noIndex />
      <section className="px-5 py-20 lg:px-8">
        <article className="mx-auto max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[.25em] text-[#19A2B6]">
            Información legal
          </p>
          <h1 className="mt-4 text-5xl font-black tracking-[-.05em]">
            {page.title}
          </h1>
          <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-bold text-amber-900">
            Pendiente de revisión legal: este contenido no constituye la versión
            definitiva.
          </div>
          <p className="mt-8 text-lg leading-8 text-black/60">{page.intro}</p>
          {page.sections.map(([title, text]) => (
            <section
              key={title}
              className="mt-10 border-t border-black/10 pt-7"
            >
              <h2 className="text-2xl font-black">{title}</h2>
              <p className="mt-3 leading-8 text-black/60">{text}</p>
            </section>
          ))}
        </article>
      </section>
    </>
  );
}
