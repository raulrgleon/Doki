export class BaseProvider {
  constructor({ name = 'base' } = {}) {
    this.name = name;
  }

  async generate() {
    throw new Error('Provider must implement generate()');
  }
}
