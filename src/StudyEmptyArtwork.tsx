import {BooksIcon} from '@phosphor-icons/react/dist/csr/Books';
import {MagnifyingGlassIcon} from '@phosphor-icons/react/dist/csr/MagnifyingGlass';

// Expressive duotone artwork is reserved for spacious study empty states.
export function StudyEmptyArtwork({search=false}:{search?:boolean}){
 const Artwork=search?MagnifyingGlassIcon:BooksIcon;
 return <span className="study-empty-artwork" data-icon-library="phosphor" aria-hidden="true"><Artwork size={56} weight="duotone" color="currentColor" focusable="false"/></span>;
}
