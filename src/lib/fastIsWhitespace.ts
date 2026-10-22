export const fastCharCodeIsWhitespace = (charCode: number) => {
  switch (charCode) {
    case 0x0009:
    case 0x000a:
    case 0x000b:
    case 0x000c:
    case 0x000d:
    case 0x0020:
    case 0x0085:
    case 0x00a0:
    case 0x1680:
    case 0x180e:
    case 0x2000:
    case 0x2001:
    case 0x2002:
    case 0x2003:
    case 0x2004:
    case 0x2005:
    case 0x2006:
    case 0x2007:
    case 0x2008:
    case 0x2009:
    case 0x200a:
    case 0x2028:
    case 0x2029:
    case 0x202f:
    case 0x205f:
    case 0x3000:
    case 0xfeff: // String.prototype.trim removes it, and stringLiteralSPELStyle skips by trim
      return true;
  }
  return false;
};
