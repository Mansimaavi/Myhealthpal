// dto/messageHistoryDto.js
class MessageHistoryDto {
  constructor(sender, content, sentiment, emotion) {
    this.sender = sender;
    this.content = content;
    this.sentiment = sentiment;
    this.emotion = emotion;
  }

  static fromEntity(message) {
    return new MessageHistoryDto(message.sender, message.content, message.sentiment, message.emotion);
  }

  toString() {
    return `sender='${this.sender}', content='${this.content}'`;
  }
}

export default MessageHistoryDto;
