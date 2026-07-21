import LegalDoc from './legal/LegalDoc';
import { PRIVACY_DOC } from '../content/privacy';

export default function Privacy() {
  return <LegalDoc {...PRIVACY_DOC} />;
}
