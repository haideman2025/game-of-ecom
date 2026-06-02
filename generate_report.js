const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "4472C4", type: ShadingType.CLEAR };

const createTableCell = (text, width, isHeader = false, align = AlignmentType.LEFT) => {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? headerShading : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: align,
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
    default: {
      document: {
        run: { font: "Arial", size: 22 }
      }
    },
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
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // Title Page
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 400 },
        children: [new TextRun({
          text: "CÔNG TY DEMAN",
          bold: true,
          size: 36,
          font: "Arial"
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
          text: "Thương hiệu: ONIIZ",
          bold: true,
          size: 28,
          font: "Arial",
          color: "4472C4"
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 600 },
        children: [new TextRun({
          text: "PHÂN TÍCH CHIẾN LƯỢC ĐÒNG BẨY TÀI CHÍNH",
          bold: true,
          size: 32,
          font: "Arial",
          color: "2E5090"
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
        children: [new TextRun({
          text: "Tái cấu trúc tài chính và mở rộng kinh doanh",
          size: 24,
          font: "Arial",
          italic: true
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 0 },
        children: [new TextRun({
          text: "Ngày chuẩn bị: 17 tháng 4, năm 2026",
          size: 22,
          font: "Arial"
        })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // Executive Summary
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("I. TÓM TẮT ĐIỀU HÀNH")]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Chiến lược đòn bẩy tài chính được đề xuất nhằm tối ưu hóa cấu trúc vốn và gia tăng khả năng mở rộng kinh doanh của Công ty Deman (thương hiệu Oniiz). Chiến lược này lợi dụng chu kỳ tái đầu tư bất động sản (BĐS) để tạo ra một vòng xoáy tài chính bền vững, cho phép công ty:",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giảm chi phí vốn từ 12-15% xuống 8% thông qua việc sử dụng BĐS làm tài sản thế chấp",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Tích lũy tài sản dài hạn có giá trị gia tăng (BĐS)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Tăng năng lực sản xuất và nhập khẩu hàng hóa cosmetics/personal care",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Đa dạng hóa danh mục đầu tư vào lĩnh vực bất động sản",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Tuy nhiên, chiến lược này đồng thời kéo theo những rủi ro đáng kể liên quan đến biến động thị trường BĐS, rủi ro lãi suất, và mối nguy hiểm từ đòn bẩy tài chính quá cao. Báo cáo này phân tích chi tiết từng giai đoạn của vòng xoáy, đánh giá ưu điểm và nhược điểm, và đưa ra khuyến nghị cụ thể để thực hiện chiến lược một cách an toàn.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // Financial Status
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("II. PHÂN TÍCH HIỆN TRẠNG TÀI CHÍNH")]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Công ty Deman hiện đạt doanh thu hàng tháng trên 5 tỷ VND, tương đương ~60 tỷ VND/năm. Công ty chuyên sản xuất và phân phối các sản phẩm mỹ phẩm và chăm sóc cá nhân, bao gồm:",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Nước hoa (Eau de Parfum, Eau de Toilette)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Bọt rửa mặt và sản phẩm chăm sóc da",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Xịt thơm phòng (Room spray)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Gối, tấm, và các sản phẩm hỗ trợ giấc ngủ",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Bộ vệ sinh (BVS) và các sản phẩm khác",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 120 },
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Điều kiện tài chính hiện tại:")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Với doanh thu ổn định và tăng trưởng liên tục, Công ty Deman có nền tảng tài chính vững chắc để huy động vốn vay. Hiện tại, công ty có thể tiếp cận vốn vay dựa trên doanh thu và hàng tồn kho, nhưng chi phí vốn tương đối cao (12-15%). Chiến lược đề xuất nhằm tối ưu hóa cấu trúc này.",
          font: "Arial",
          size: 22
        })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz_Part1.docx", buffer);
  console.log("Part 1 created successfully");
});
