import LegalDoc from './legal/LegalDoc';
import { TERMS_DOC } from '../content/terms';

export default function Terms() {
  return <LegalDoc {...TERMS_DOC} />;
}
