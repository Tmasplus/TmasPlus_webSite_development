import { PDFDownloadLink, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import FirmaGerente from "@/assets/react.svg";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
  text: { marginBottom: 6, textAlign: "justify" },
  bold: { fontWeight: "bold" },
  signature: { marginTop: 40, textAlign: "center" },
  img: { width: 180, height: 60, alignSelf: "center" },
});

interface ContractPDFProps {
  auth: any;
}

export default function ContractPDF({ auth }: ContractPDFProps) {
  const today = new Date();
  const formatted = today.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const MyDocument = (
    <Document>
      <Page style={styles.page}>
        <Text style={styles.title}>Contrato de Prestación de Servicios</Text>
        <View>
          <Text style={styles.text}>
            Entre <Text style={styles.bold}>TREAS CORP S.A.S</Text> y{" "}
            <Text style={styles.bold}>
              {auth.firstName} {auth.lastName}
            </Text>, se celebra este contrato con fecha {formatted}.
          </Text>
          <Text style={styles.text}>
            El contratista declara poseer la empresa{" "}
            <Text style={styles.bold}>{auth.CompanyName}</Text>, identificada
            con NIT {auth.NIT}, con domicilio en{" "}
            {auth.addresCompany}, {auth.cityCompany}.
          </Text>
          <Text style={styles.text}>
            Ambas partes acuerdan el cumplimiento de la normativa vigente
            en materia de transporte especial y servicios tecnológicos.
          </Text>
        </View>

        <View style={styles.signature}>
          <Image src={FirmaGerente} style={styles.img} />
          <Text>_________________________</Text>
          <Text>TREAS CORP S.A.S</Text>
          <Text>Gerente General</Text>
        </View>
      </Page>
    </Document>
  );

  return (
    <PDFDownloadLink
      document={MyDocument}
      fileName={`Contrato_${auth.firstName}_${auth.lastName}.pdf`}
      className="bg-red_treas hover:bg-red-700 text-white px-4 py-2 rounded-lg"
    >
      {({ loading }) => (loading ? "Generando..." : "Descargar Contrato PDF")}
    </PDFDownloadLink>
  );
}
