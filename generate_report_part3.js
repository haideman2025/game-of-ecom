const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "4472C4", type: ShadingType.CLEAR };

const createTableCell = (text, width, isHeader = false) => {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? headerShading : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: text,
        bold: isHeader,
        color: isHeader ? "FFFFFF" : "000000",
        font: "Arial",
        size: 22
      })]
    })]
  });
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "2E5090" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("IV. ĐÁNH GIÁ ƯU ĐIỂM")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.1. Tối ưu hóa chi phí vốn")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Giảm lãi suất vay từ 12-15% (dòng tiền/inventory) xuống 8% (BĐS) sẽ tiết kiệm chi phí tài chính đáng kể. Ví dụ: Vay 1 tỷ VND trong 1 năm:",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Lãi suất 12%: 120 triệu VND lãi",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Lãi suất 8%: 80 triệu VND lãi → Tiết kiệm 40 triệu VND/năm",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.2. Tích lũy tài sản dài hạn")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Bất động sản thường có tính tăng giá theo thời gian (đặc biệt ở thị trường Việt Nam). Bằng cách thế chấp BĐS để vay và tái đầu tư, công ty vừa có vốn sinh hoạt vừa tích lũy tài sản có giá trị gia tăng dài hạn.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.3. Tăng năng lực tài chính doanh nghiệp")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Vốn sinh hoạt tăng cho phép công ty mở rộng sản xuất, nhập khẩu hàng hóa, và thâm nhập thị trường mới. Điều này sẽ tăng doanh thu và khả năng trả nợ.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("4.4. Đa dạng hóa danh mục đầu tư")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Ngoài kinh doanh cosmetics, công ty có thêm nguồn doanh thu từ BĐS (cho thuê, bán), giảm rủi ro phụ thuộc hoàn toàn vào một lĩnh vực.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("V. ĐÁNH GIÁ RỦI RO VÀ NHƯỢC ĐIỂM")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.1. Rủi ro thị trường bất động sản")]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Vấn đề chính:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giá BĐS có thể giảm do biến động thị trường, khủng hoảng kinh tế, hoặc thay đổi chính sách",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Nếu giá BĐS giảm, giá trị tài sản thế chấp cũng giảm → Ngân hàng có thể yêu cầu bổ sung tài sản thế chấp",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Trong trường hợp xấu, công ty có thể mất BĐS nếu không trả nợ",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.2. Rủi ro lãi suất biến động")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Lãi suất 8% được giả định dựa trên điều kiện thị trường hiện tại. Nếu lãi suất tăng (ví dụ lên 10-12%), chi phí vốn sẽ tăng và làm giảm lợi nhuận. Công ty cần cân nhắc rủi ro này và có thể khóa lãi suất cố định qua hợp đồng dài hạn.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.3. Rủi ro thanh khoản")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Nếu doanh thu cosmetics giảm đột ngột (do thay đổi xu hướng tiêu dùng, cạnh tranh, hoặc khủng hoảng kinh tế), công ty sẽ gặp khó khăn trong việc trả nợ. Vòng xoáy đòn bẩy sẽ lật ngược - thay vì tăng trưởng, công ty sẽ rơi vào spiral suy giảm.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.4. Rủi ro pháp lý và quyền sở hữu")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Cần đảm bảo pháp lý chặt chẽ cho tài sản thế chấp: Sổ đăng ký (SĐKR) và sổ hồng phải rõ ràng, không tranh chấp. Nếu có vấn đề pháp lý, công ty có thể mất quyền sử dụng BĐS hoặc tài sản bị tịch thu.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.5. Rủi ro từ đòn bẩy tài chính quá cao")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Đòn bẩy tài chính (D/E ratio) quá cao (tức là nợ vượt quá vốn chủ sở hữu) làm tăng mối nguy vỡ nợ. Công ty cần giữ D/E ratio ở mức an toàn (ví dụ dưới 2:1) để tránh nguy hiểm này.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("5.6. Mất tập trung vào ngành chính")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Việc quản lý BĐS song song với kinh doanh cosmetics sẽ tốn thời gian và tài nguyên quản lý. Công ty cần đảm bảo không làm giảm chất lượng và hiệu quả của ngành chính (mỹ phẩm/chăm sóc cá nhân).",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz_Part3.docx", buffer);
  console.log("Part 3 created successfully");
});
